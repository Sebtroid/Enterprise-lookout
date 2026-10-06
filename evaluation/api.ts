import { createApp } from "../apps/api/src/create-app";

const port = Number(process.env.PORT ?? "4311");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error("PORT debe ser un puerto válido.");
}
const app = await createApp();
await app.listen(port, "127.0.0.1");
console.log(`Lookout evaluation API: http://localhost:${port}`);
