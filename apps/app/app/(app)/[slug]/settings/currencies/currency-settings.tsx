"use client";

import { CURRENCIES } from "@crm/db/currency";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { CardTableEmpty } from "@crm/ui/components/card-table";
import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { formatCount } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";

const RATE_COLUMNS: SimpleTableColumn[] = [
	{ id: "currency", header: "Moneda" },
	{ id: "rate", header: "Rate", width: "w-32", align: "right" },
	{ id: "source", header: "Fuente", width: "w-28" },
	{ id: "asOf", header: "As of", width: "w-24", align: "right" },
	{ id: "actions", srLabel: "Acciones", width: "w-20" },
];

const USAGE_COLUMNS: SimpleTableColumn[] = [
	{ id: "currency", header: "Moneda" },
	{ id: "deals", header: "Auspicios", width: "w-20", align: "right" },
	{ id: "convertible", header: "Convertible", width: "w-32", align: "right" },
];

export function CurrencySettings() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const baseId = useId();
	const rateCurrencyId = useId();
	const rateValueId = useId();

	const [draftCurrency, setDraftCurrency] = useState("");
	const [draftRate, setDraftRate] = useState("");

	const settings = useQuery(trpc.currency.settings.queryOptions());

	const invalidate = () => cache.currency();

	const setBase = useMutation(
		trpc.currency.setReportingCurrency.mutationOptions({
			onSuccess: async (next) => {
				await invalidate();
				toast.success(
					`Every total is now reported in ${next.reportingCurrency}.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const setRate = useMutation(
		trpc.currency.setManualRate.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				setDraftCurrency("");
				setDraftRate("");
				toast.success("Tipo de cambio guardado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const removeRate = useMutation(
		trpc.currency.removeManualRate.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Tipo de cambio eliminado.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const refresh = useMutation(
		trpc.currency.refreshRates.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Tipos de cambio actualizados.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!settings.data) return null;

	const {
		reportingCurrency,
		refreshedAt,
		rates,
		inUse,
		unconverted,
		canManage,
	} = settings.data;

	const busy =
		!canManage ||
		setBase.isPending ||
		setRate.isPending ||
		removeRate.isPending ||
		refresh.isPending;

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Moneda de referencia</CardTitle>
					<CardDescription>
						Define la moneda para los acuerdos comerciales en otras monedas. Los
						presupuestos y aportes de eventos se registran en pesos chilenos.
					</CardDescription>
				</CardHeader>

				<CardContent>
					<Field>
						<FieldLabel htmlFor={baseId}>Mostrar totales en</FieldLabel>
						<Select
							value={reportingCurrency}
							disabled={busy}
							onValueChange={(currency) => setBase.mutate({ currency })}
						>
							<SelectTrigger id={baseId} className="w-full max-w-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CURRENCIES.map((entry) => (
									<SelectItem key={entry.code} value={entry.code}>
										{entry.code} · {entry.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldDescription>
							{canManage
								? "Los acuerdos en otras monedas se recalculan con los tipos de cambio actuales."
								: "Solo el responsable o un administrador puede cambiar la moneda de referencia."}
						</FieldDescription>
					</Field>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Tipos de cambio</CardTitle>
					<CardDescription>
						Valor de una unidad de cada moneda en {reportingCurrency}. Los tipos
						se consultan cada día; los valores manuales tienen prioridad.
					</CardDescription>
					<CardAction>
						<Button
							variant="contrast"
							size="sm"
							disabled={busy}
							onClick={() => refresh.mutate()}
						>
							{refresh.isPending ? <Spinner data-icon="inline-start" /> : null}
							Actualizar
						</Button>
					</CardAction>
				</CardHeader>

				<CardContent>
					<form
						className="flex flex-wrap items-end gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							const rate = Number.parseFloat(draftRate);
							if (!Number.isFinite(rate) || rate <= 0) {
								toast.error(
									"El tipo de cambio debe ser un número mayor que cero.",
								);
								return;
							}
							setRate.mutate({ currency: draftCurrency, rate });
						}}
					>
						<Field className="w-48">
							<FieldLabel htmlFor={rateCurrencyId}>Moneda</FieldLabel>
							<Select
								value={draftCurrency}
								disabled={busy}
								onValueChange={setDraftCurrency}
							>
								<SelectTrigger id={rateCurrencyId} className="w-full">
									<SelectValue placeholder="Seleccionar" />
								</SelectTrigger>
								<SelectContent>
									{CURRENCIES.filter(
										(entry) => entry.code !== reportingCurrency,
									).map((entry) => (
										<SelectItem key={entry.code} value={entry.code}>
											{entry.code} · {entry.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field className="w-48">
							<FieldLabel htmlFor={rateValueId}>
								1 {draftCurrency || "unidad"} = ? {reportingCurrency}
							</FieldLabel>
							<Input
								id={rateValueId}
								value={draftRate}
								inputMode="decimal"
								placeholder="1.09"
								disabled={busy}
								onChange={(event) => setDraftRate(event.target.value)}
							/>
						</Field>

						<Button
							type="submit"
							disabled={busy || draftCurrency === "" || draftRate.trim() === ""}
						>
							{setRate.isPending ? <Spinner data-icon="inline-start" /> : null}
							Guardar tipo de cambio
						</Button>
					</form>
				</CardContent>

				{rates.length === 0 ? (
					<CardTableEmpty>
						Aún no hay tipos de cambio. Actualiza o introduce uno manualmente.
					</CardTableEmpty>
				) : (
					<SimpleTable columns={RATE_COLUMNS}>
						{rates.map((rate) => (
							<SimpleTableRow key={rate.currency}>
								<TableCell className={CELL}>
									<span className="font-medium">{rate.currency}</span>
									<span className="text-muted-foreground">
										{rate.name ? ` · ${rate.name}` : ""}
									</span>
								</TableCell>
								<TableCell className={`${CELL} text-right tabular-nums`}>
									{rate.rate}
								</TableCell>
								<TableCell className={CELL}>
									<StatusIndicator
										size="sm"
										tone={rate.source === "MANUAL" ? "warning" : "success"}
										label={rate.source === "MANUAL" ? "Manual" : "Consultado"}
									/>
								</TableCell>
								<TableCell
									className={`${CELL} text-right text-muted-foreground`}
								>
									<LocalRelativeTime date={rate.asOf} />
								</TableCell>
								<TableCell className={`${CELL} text-right`}>
									{rate.source === "MANUAL" ? (
										<Button
											variant="ghost"
											size="sm"
											disabled={busy}
											onClick={() =>
												removeRate.mutate({ currency: rate.currency })
											}
										>
											Quitar
										</Button>
									) : null}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Monedas utilizadas</CardTitle>
					<CardDescription>
						{unconverted.count === 0
							? "Todos los acuerdos con monto tienen un tipo de cambio disponible."
							: `${formatCount(unconverted.count, "auspicio")} sin tipo de cambio. Estos montos quedan fuera de los totales.`}
						{refreshedAt ? (
							<>
								{" "}
								Última actualización <LocalRelativeTime date={refreshedAt} />.
							</>
						) : null}
					</CardDescription>
				</CardHeader>

				{inUse.length === 0 ? (
					<CardTableEmpty>Todavía no hay auspicios con monto.</CardTableEmpty>
				) : (
					<SimpleTable columns={USAGE_COLUMNS}>
						{inUse.map((row) => (
							<SimpleTableRow key={row.currency}>
								<TableCell className={CELL}>
									<span className="font-medium">{row.currency}</span>
									<span className="text-muted-foreground">
										{row.name ? ` · ${row.name}` : ""}
									</span>
									{row.currency === reportingCurrency ? (
										<span className="text-muted-foreground">
											{" "}
											· moneda de referencia
										</span>
									) : null}
								</TableCell>
								<TableCell className={`${CELL} text-right tabular-nums`}>
									{row.deals}
								</TableCell>
								<TableCell className={`${CELL} text-right`}>
									{row.convertible ? (
										<StatusIndicator size="sm" tone="success" label="Sí" />
									) : (
										<StatusIndicator
											size="sm"
											tone="error"
											label="Sin tipo de cambio"
										/>
									)}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</Card>
		</div>
	);
}
