import "../packages/env/src/load";
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { localRuntimeStateSchema } from "../packages/validation/src/lookout-runtime";
import { LOCAL_RUNTIME } from "./lookout-runtime.config";

const root = resolve(import.meta.dir, "..");
const statePath = join(root, ".scratch/lookout-runtime.json");
const services: { name: string; process: ReturnType<typeof Bun.spawn> }[] = [];
let closing = false;
let ownsState = false;

async function stop() {
	if (closing) return;
	closing = true;
	for (const service of services) service.process.kill("SIGTERM");
	await Promise.race([
		Promise.allSettled(services.map((service) => service.process.exited)),
		Bun.sleep(LOCAL_RUNTIME.shutdownGraceMs),
	]);
	for (const service of services)
		if (service.process.exitCode === null) service.process.kill("SIGKILL");
	if (ownsState)
		await Bun.file(statePath)
			.delete()
			.catch(() => {});
}

function nodeBinary() {
	const direct = Bun.which("node");
	const cachedRoot = join(homedir(), ".npm/_npx");
	const candidates = [
		direct,
		...(existsSync(cachedRoot)
			? readdirSync(cachedRoot).map((name) =>
					join(cachedRoot, name, "node_modules/node/bin/node"),
				)
			: []),
	];
	for (const candidate of candidates) {
		if (!candidate || !existsSync(candidate)) continue;
		const version = Bun.spawnSync([candidate, "--version"])
			.stdout.toString()
			.trim();
		if (
			Number(version.replace(/^v/, "").split(".")[0]) >=
			LOCAL_RUNTIME.minimumNodeMajor
		)
			return candidate;
	}
	throw new Error(
		"Instala Node 24 o agrega su binario al PATH antes de iniciar Lookout.",
	);
}

async function launch(
	name: string,
	cmd: string[],
	cwd: string,
	extra: { NITRO_PORT?: string; NITRO_HOST?: string } = {},
) {
	const log = openSync(
		join(root, `.scratch/lookout-${name}-runtime.log`),
		"w",
		0o600,
	);
	const process = Bun.spawn(cmd, {
		cwd,
		env: {
			...Bun.env,
			NODE_ENV: "production",
			NODE_OPTIONS: `--max-old-space-size=${LOCAL_RUNTIME.heapMb}`,
			NEXT_TELEMETRY_DISABLED: "1",
			...extra,
		},
		stdout: log,
		stderr: log,
	});
	closeSync(log);
	services.push({ name, process });
	return process;
}

async function ready(url: string) {
	const started = Date.now();
	while (Date.now() - started < LOCAL_RUNTIME.readyTimeoutMs) {
		if (closing) throw new Error("Inicio detenido.");
		try {
			if (
				(
					await fetch(url, {
						signal: AbortSignal.timeout(LOCAL_RUNTIME.requestTimeoutMs),
						redirect: "manual",
					})
				).status < 500
			)
				return;
		} catch {}
		await Bun.sleep(LOCAL_RUNTIME.readyPollMs);
	}
	throw new Error(
		`El servidor no responde en ${new URL(url).origin}. Revisa los registros de .scratch.`,
	);
}

async function memoryGuard() {
	while (!closing) {
		await Bun.sleep(LOCAL_RUNTIME.monitorIntervalMs);
		const rows = Bun.spawnSync(["ps", "-axo", "pid,ppid,rss"])
			.stdout.toString()
			.trim()
			.split("\n")
			.slice(1)
			.map((line) => line.trim().split(/\s+/).map(Number));
		const mine = new Set([
			process.pid,
			...services.map((service) => service.process.pid),
		]);
		let changed = true;
		while (changed) {
			changed = false;
			for (const [pid, parent] of rows)
				if (pid && parent && mine.has(parent) && !mine.has(pid)) {
					mine.add(pid);
					changed = true;
				}
		}
		const residentKb = rows.reduce(
			(total, [pid, , rss]) => total + (pid && rss && mine.has(pid) ? rss : 0),
			0,
		);
		if (residentKb > LOCAL_RUNTIME.maxResidentMb * 1024)
			throw new Error(
				`Lookout superó ${LOCAL_RUNTIME.maxResidentMb} MB de RAM residente. Los servicios se detienen para cuidar el Mac.`,
			);
	}
}

process.on("SIGINT", () => {
	void stop().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
	void stop().then(() => process.exit(0));
});

try {
	mkdirSync(join(root, ".scratch"), { recursive: true, mode: 0o700 });
	if (existsSync(statePath)) {
		const { pid } = localRuntimeStateSchema.parse(await Bun.file(statePath).json());
		try {
			process.kill(pid, 0);
			throw new Error(
				"Lookout ya tiene un inicio activo. Usa Ctrl+C en ese terminal antes de volver a iniciar.",
			);
		} catch (error) {
			if (error instanceof Error && !error.message.includes("ESRCH"))
				throw error;
		}
		await Bun.file(statePath).delete();
	}
	if (
		new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") !==
		"lookout_v2"
	)
		throw new Error("Este inicio usa solo el Supabase privado lookout_v2.");
	const node = nodeBinary();
	for (const artifact of [
		"apps/api/dist/main.js",
		"apps/app/.next/BUILD_ID",
		"apps/agent/.output/server/index.mjs",
	])
		if (!existsSync(join(root, artifact)))
			throw new Error(`Falta compilar ${artifact}. Consulta docs/setup.md.`);
	const api = new URL(process.env.API_URL ?? "http://localhost:4311");
	const app = new URL(
		process.env.APP_URL?.split(",")[0] ?? "http://localhost:4310",
	);
	for (const url of [api, app]) {
		if (!["localhost", "127.0.0.1"].includes(url.hostname))
			throw new Error(
				"Este inicio es local. Configura el despliegue separado para dominios públicos.",
			);
		try {
			await fetch(new URL("/health", url), {
				signal: AbortSignal.timeout(500),
			});
			throw new Error(`El puerto ${url.port} está ocupado.`);
		} catch (error) {
			if (error instanceof Error && error.message.includes("está ocupado"))
				throw error;
		}
	}
	const lock = openSync(statePath, "wx", 0o600);
	writeFileSync(lock, JSON.stringify({ pid: process.pid, services: [] }));
	closeSync(lock);
	ownsState = true;
	await launch(
		"api",
		[process.execPath, join(root, "apps/api/dist/main.js")],
		join(root, "apps/api"),
	);
	await ready(new URL("/health", api).toString());
	await launch(
		"app",
		[
			node,
			join(root, "apps/app/node_modules/next/dist/bin/next"),
			"start",
			"--hostname",
			"127.0.0.1",
			"--port",
			app.port || "4310",
		],
		join(root, "apps/app"),
	);
	await ready(new URL("/sign-in", app).toString());
	await launch(
		"agent",
		[node, join(root, "apps/agent/.output/server/index.mjs")],
		join(root, "apps/agent"),
		{ NITRO_PORT: process.env.AGENT_PORT ?? "2000", NITRO_HOST: "127.0.0.1" },
	);
	await ready(
		`http://127.0.0.1:${process.env.AGENT_PORT ?? "2000"}/eve/v1/health`,
	);
	await Bun.write(
		statePath,
		JSON.stringify({
			pid: process.pid,
			services: services.map((service) => ({
				name: service.name,
				pid: service.process.pid,
			})),
		}),
	);
	console.log(
		`Lookout listo: ${app.origin}. Tres servicios compilados, heap máximo de 512 MB cada uno. Ctrl+C los detiene.`,
	);
	await Promise.race([
		memoryGuard(),
		...services.map(async (service) => {
			const code = await service.process.exited;
			if (!closing)
				throw new Error(
					`${service.name} terminó con código ${code}. Revisa .scratch/lookout-${service.name}-runtime.log.`,
				);
		}),
	]);
} catch (error) {
	console.error(
		error instanceof Error ? error.message : "No se pudo iniciar Lookout.",
	);
	await stop();
	process.exit(1);
}
