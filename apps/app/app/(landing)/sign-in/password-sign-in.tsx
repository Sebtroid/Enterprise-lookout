"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

export function PasswordSignIn() {
	const [activate, setActivate] = useState(false);
	const [pending, setPending] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [invite, setInvite] = useState("");

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending) return;
		setPending(true);

		try {
			const normalizedEmail = email.trim().toLowerCase();
			const result = activate
				? await authClient.signUp.email(
						{
							name: name.trim(),
							email: normalizedEmail,
							password,
						},
						{ headers: { "x-lookout-invite": invite.trim() } },
					)
				: await authClient.signIn.email({
						email: normalizedEmail,
						password,
					});

			if (result.error) {
				toast.error(
					activate
						? "No pudimos activar tu cuenta. Revisa el correo, la contraseña y la invitación."
						: "No pudimos ingresar. Revisa el correo y la contraseña.",
				);
				return;
			}

			window.location.assign("/");
		} catch {
			toast.error("No pudimos conectar con el servicio de acceso.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="flex flex-col gap-5">
			<form className="flex flex-col gap-4" onSubmit={submit}>
				{activate ? (
					<div className="flex flex-col gap-2">
						<Label htmlFor="lookout-name">Tu nombre</Label>
						<Input
							id="lookout-name"
							autoComplete="name"
							minLength={2}
							onChange={(event) => setName(event.target.value)}
							required
							value={name}
						/>
					</div>
				) : null}
				<div className="flex flex-col gap-2">
					<Label htmlFor="lookout-email">Correo</Label>
					<Input
						id="lookout-email"
						autoComplete="email"
						onChange={(event) => setEmail(event.target.value)}
						required
						type="email"
						value={email}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="lookout-password">Contraseña</Label>
					<Input
						id="lookout-password"
						autoComplete={activate ? "new-password" : "current-password"}
						minLength={activate ? 12 : undefined}
						onChange={(event) => setPassword(event.target.value)}
						required
						type="password"
						value={password}
					/>
					{activate ? (
						<p className="text-muted-foreground text-xs">
							Usa al menos 12 caracteres.
						</p>
					) : null}
				</div>
				{activate ? (
					<div className="flex flex-col gap-2">
						<Label htmlFor="lookout-invite">Código de invitación</Label>
						<Input
							id="lookout-invite"
							autoComplete="off"
							onChange={(event) => setInvite(event.target.value)}
							required
							type="password"
							value={invite}
						/>
					</div>
				) : null}
				<Button className="w-full" disabled={pending} type="submit">
					{pending ? <Spinner data-icon="inline-start" /> : null}
					{activate ? "Activar mi cuenta" : "Ingresar"}
				</Button>
			</form>
			<button
				className="self-center text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
				disabled={pending}
				onClick={() => setActivate((value) => !value)}
				type="button"
			>
				{activate ? "Ya tengo cuenta" : "Tengo una invitación"}
			</button>
		</div>
	);
}
