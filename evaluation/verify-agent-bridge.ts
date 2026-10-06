import "../packages/env/src/load";
import { strict as assert } from "node:assert";
import { mintBridgeToken } from "../apps/app/lib/agent-bridge";

const base = new URL(process.env.AGENT_URL ?? "http://127.0.0.1:2000");
assert.equal(base.hostname, "127.0.0.1");
assert.ok(process.env.AGENT_BRIDGE_SECRET);

const request = (token?: string) =>
	fetch(new URL("/eve/v1/info", base), {
		headers: {
			host: "lookout-agent.example.com",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
	});

assert.equal((await request()).status, 401);
assert.equal((await request("invalid-token")).status, 401);
console.log("PASS: Dom rechaza solicitudes sin firma y firmas inválidas.");

const token = await mintBridgeToken({
	id: "verification-user",
	email: "verification@example.invalid",
	name: "Verificación del puente",
});
const response = await request(token);
assert.equal(response.status, 200);
const info = (await response.json()) as {
	agent?: { model?: { id?: string } };
};
assert.equal(info.agent?.model?.id, "zai/glm-5.3");
console.log(
	"PASS: el puente firmado llega a Dom con GLM 5.3, sin ejecutar IA.",
);

const unsigned = await fetch("http://localhost:4310/eve/v1/info", {
	redirect: "manual",
});
assert.ok(unsigned.status === 401 || unsigned.status === 307);
if (unsigned.status === 307) {
	assert.equal(
		new URL(unsigned.headers.get("location") ?? "", unsigned.url).pathname,
		"/sign-in",
	);
}
console.log("PASS: la app exige una sesión antes de acceder a Dom.");
