"use client";

import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@crm/ui/components/native-select";
import { Textarea } from "@crm/ui/components/textarea";
import { useId, useState } from "react";
import { ContactPicker } from "./contact-picker";

export type EditorField = {
	name: string;
	label: string;
	type?:
		| "text"
		| "number"
		| "date"
		| "textarea"
		| "select"
		| "email"
		| "multi"
		| "contact";
	value?: string | number | string[];
	required?: boolean;
	options?: { value: string; label: string }[];
	min?: number;
	max?: number;
	visibleWhen?: { field: string; values: string[] };
	companyId?: string;
	selectedContact?: { id: string; name: string; email: string | null };
};

type EditorProps = {
	title: string;
	description?: string;
	fields: EditorField[];
	onSave: (form: FormData) => Promise<void>;
	label?: string;
	disabled?: boolean;
};

export function Editor({
	title,
	description,
	fields,
	onSave,
	label,
	disabled = false,
}: EditorProps) {
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [selectedValues, setSelectedValues] = useState<Record<string, string>>(
		{},
	);
	const uid = useId();

	const changeOpen = (next: boolean) => {
		if (busy) return;
		setOpen(next);
		setError("");
		setSelectedValues({});
	};

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" disabled={disabled}>
					{label ?? title}
				</Button>
			</DialogTrigger>
			<DialogContent scrollable>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{description ?? "Completa los datos. Puedes editarlos después."}
					</DialogDescription>
				</DialogHeader>
				<form
					aria-busy={busy}
					onSubmit={async (event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						setBusy(true);
						setError("");
						try {
							await onSave(form);
							setOpen(false);
						} catch (cause) {
							setError(
								cause instanceof Error ? cause.message : "No se pudo guardar.",
							);
						} finally {
							setBusy(false);
						}
					}}
				>
					<FieldGroup>
						{fields.map((field) => {
							const fieldId = `${uid}-${field.name}`;
							const dependency = field.visibleWhen
								? fields.find(
										(other) => other.name === field.visibleWhen?.field,
									)
								: undefined;
							const dependencyValue = dependency
								? (selectedValues[dependency.name] ??
									String(
										dependency.value ?? dependency.options?.[0]?.value ?? "",
									))
								: "";
							const visible =
								!field.visibleWhen ||
								field.visibleWhen.values.includes(dependencyValue);

							if (field.type === "multi") {
								const control = (
									<FieldSet key={field.name}>
										<FieldLegend variant="label">{field.label}</FieldLegend>
										<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
											{field.options?.map((option, index) => {
												const optionId = `${fieldId}-${index}`;
												return (
													<div
														key={option.value}
														className="flex items-center gap-2"
													>
														<Checkbox
															id={optionId}
															name={field.name}
															value={option.value}
															defaultChecked={
																Array.isArray(field.value) &&
																field.value.includes(option.value)
															}
															disabled={!visible}
														/>
														<FieldLabel htmlFor={optionId}>
															{option.label}
														</FieldLabel>
													</div>
												);
											})}
										</div>
									</FieldSet>
								);
								return field.visibleWhen ? (
									<div key={field.name} hidden={!visible}>
										{control}
									</div>
								) : (
									control
								);
							}

							const control = (
								<Field key={field.name}>
									<FieldLabel htmlFor={fieldId}>{field.label}</FieldLabel>
									{field.type === "contact" && field.companyId ? (
										<>
											<ContactPicker
												id={fieldId}
												companyId={field.companyId}
												value={
													selectedValues[field.name] ??
													String(field.value ?? "")
												}
												onValueChange={(next) =>
													setSelectedValues((values) => ({
														...values,
														[field.name]: next,
													}))
												}
												selected={field.selectedContact}
												disabled={!visible}
											/>
											<input
												type="hidden"
												name={field.name}
												value={
													selectedValues[field.name] ??
													String(field.value ?? "")
												}
												disabled={!visible}
											/>
										</>
									) : field.type === "textarea" ? (
										<Textarea
											id={fieldId}
											name={field.name}
											defaultValue={field.value}
											required={field.required}
											disabled={!visible}
										/>
									) : field.type === "select" ? (
										<NativeSelect
											id={fieldId}
											name={field.name}
											defaultValue={field.value}
											required={field.required}
											disabled={!visible}
											onChange={(event) =>
												setSelectedValues((values) => ({
													...values,
													[field.name]: event.target.value,
												}))
											}
										>
											{field.options?.map((option) => (
												<NativeSelectOption
													key={option.value}
													value={option.value}
												>
													{option.label}
												</NativeSelectOption>
											))}
										</NativeSelect>
									) : (
										<Input
											id={fieldId}
											name={field.name}
											type={field.type ?? "text"}
											defaultValue={field.value}
											required={field.required}
											disabled={!visible}
											min={
												field.type === "number" ? (field.min ?? 0) : undefined
											}
											max={field.type === "number" ? field.max : undefined}
											step={field.type === "number" ? 1 : undefined}
										/>
									)}
								</Field>
							);
							return field.visibleWhen ? (
								<div key={field.name} hidden={!visible}>
									{control}
								</div>
							) : (
								control
							);
						})}
					</FieldGroup>
					{error && <FieldError>{error}</FieldError>}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={busy}
							onClick={() => changeOpen(false)}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={busy}>
							{busy ? "Guardando…" : "Guardar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export const value = (form: FormData, key: string) =>
	String(form.get(key) ?? "").trim();

export const number = (form: FormData, key: string) =>
	Number(value(form, key) || 0);

export const dateValue = (form: FormData, key: string) =>
	value(form, key)
		? new Date(`${value(form, key)}T12:00:00`).toISOString()
		: null;
