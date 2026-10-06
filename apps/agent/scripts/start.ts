import "@crm/env/load";
import { spawn } from "node:child_process";
import { constants } from "node:os";
import { fileURLToPath } from "node:url";

const rawPort = process.env.AGENT_PORT ?? process.env.PORT ?? "2000";
const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error(
		`AGENT_PORT or PORT must be a valid port, received ${rawPort}.`,
	);
}

const entrypoint = fileURLToPath(
	new URL("../.output/server/index.mjs", import.meta.url),
);
const child = spawn("node", [entrypoint], {
	stdio: "inherit",
	env: { ...process.env, NITRO_PORT: String(port) },
});

let settled = false;

const finish = (code: number) => {
	if (settled) return;
	settled = true;
	process.exitCode = code;
};

const forward = (signal: NodeJS.Signals) => {
	if (!child.killed) child.kill(signal);
};

process.once("SIGINT", forward);
process.once("SIGTERM", forward);

child.once("exit", (code, signal) => {
	const signalNumber = signal ? constants.signals[signal] : null;
	finish(code ?? (signalNumber ? 128 + signalNumber : 1));
});

child.once("error", (error) => {
	console.error(`[agent] could not start eve: ${error.message}`);
	finish(1);
});
