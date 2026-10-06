import "../packages/env/src/load";

if (!process.env.DATABASE_URL?.includes("@127.0.0.1:55439/lookout_v2_lab?"))
	throw new Error("Esta prueba usa solo el laboratorio local.");

process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.ALLOWED_SIGN_IN = "sebawitting@gmail.com";

const { auth, isWorkspaceEmail } = await import("../packages/auth/src/index");
const { db } = await import("../packages/db/src/client");
let state: string | null = null;

try {
	if (
		!isWorkspaceEmail("sebawitting@gmail.com") ||
		isWorkspaceEmail("sawitting@miuandes.cl") ||
		isWorkspaceEmail("otro@gmail.com")
	)
		throw new Error(
			"La lista de acceso no corresponde al correo de ingreso autorizado.",
		);
	console.log(
		"PASS: solo el correo de ingreso autorizado; correo de envío separado.",
	);
	const result = await auth.api.signInSocial({
		body: {
			provider: "google",
			callbackURL: "http://localhost:4310/",
			disableRedirect: true,
		},
		headers: new Headers({ origin: "http://localhost:4310" }),
	});
	if (!result.url) throw new Error("Google no generó la URL de acceso.");
	const url = new URL(result.url);
	state = url.searchParams.get("state");
	const scopes = new Set(url.searchParams.get("scope")?.split(" "));
	if (
		url.hostname !== "accounts.google.com" ||
		!["openid", "email", "profile"].every((scope) => scopes.has(scope)) ||
		[...scopes].some(
			(scope) => scope?.includes("gmail") || scope?.includes("calendar"),
		)
	)
		throw new Error("El acceso solicita permisos distintos de identidad.");
	if (
		url.searchParams.get("redirect_uri") !==
			"http://localhost:4311/api/auth/callback/google" ||
		!state ||
		!url.searchParams.get("code_challenge")
	)
		throw new Error("La redirección o la protección OAuth están incompletas.");
	console.log(
		"PASS: OAuth con identidad, estado y PKCE; callback localhost:4311 correcto.",
	);
	const rejected = await auth.handler(
		new Request("http://localhost:4311/api/auth/sign-in/social", {
			method: "POST",
			headers: {
				origin: "http://localhost:4310",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				provider: "google",
				callbackURL: "https://example.invalid/",
				disableRedirect: true,
			}),
		}),
	);
	if (rejected.status !== 403)
		throw new Error("Se permite una redirección a un origen ajeno.");
	console.log("PASS: redirecciones externas bloqueadas.");
} finally {
	if (state) await db.verification.deleteMany({ where: { identifier: state } });
	await db.$disconnect();
}
