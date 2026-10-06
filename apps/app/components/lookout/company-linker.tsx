"use client";

import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Field, FieldLabel } from "@crm/ui/components/field";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CompanyPicker } from "@/components/crm/company-picker";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function CompanyLinker({
	linkedIds,
	disabled,
	onLink,
}: {
	linkedIds: string[];
	disabled: boolean;
	onLink: (companyId: string) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [companyId, setCompanyId] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const params = useSearchParams();
	const url = useWorkspaceUrl();
	const alreadyLinked = linkedIds.includes(companyId);
	const next = new URLSearchParams();
	next.set("new", "true");
	for (const key of ["person", "work"]) {
		const value = params.get(key);
		if (value) next.set(key, value);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				setOpen(value);
				if (!value) {
					setCompanyId("");
					setError("");
				}
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" disabled={disabled}>
					Añadir empresa
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Añadir empresa al evento</DialogTitle>
					<DialogDescription>
						Busca en la base compartida. El seguimiento y los aportes se
						guardarán solo en este evento.
					</DialogDescription>
				</DialogHeader>
				<Field>
					<FieldLabel htmlFor="event-company">Empresa</FieldLabel>
					<CompanyPicker
						id="event-company"
						value={companyId}
						onValueChange={setCompanyId}
						placeholder="Buscar empresa…"
					/>
				</Field>
				{alreadyLinked && (
					<p className="text-sm text-muted-foreground">
						Esta empresa ya participa en el evento.
					</p>
				)}
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				<DialogFooter>
					<Button variant="ghost" asChild>
						<Link href={`${url("/companies")}?${next}`}>
							Crear nueva empresa
						</Link>
					</Button>
					<Button
						disabled={!companyId || alreadyLinked || busy}
						onClick={async () => {
							setBusy(true);
							setError("");
							try {
								await onLink(companyId);
								setOpen(false);
								setCompanyId("");
							} catch (cause) {
								setError(
									cause instanceof Error
										? cause.message
										: "No se pudo añadir la empresa.",
								);
							} finally {
								setBusy(false);
							}
						}}
					>
						{busy ? "Añadiendo…" : "Añadir al evento"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
