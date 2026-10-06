"use client";

import { Combobox, type ComboboxOption } from "@crm/ui/components/combobox";
import { useSearchInput } from "@crm/ui/hooks/use-search-input";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc/client";

const NONE = "__none__";

export function ContactPicker({
	id,
	companyId,
	value,
	onValueChange,
	selected,
	disabled,
}: {
	id: string;
	companyId: string;
	value: string;
	onValueChange: (next: string) => void;
	selected?: { id: string; name: string; email: string | null };
	disabled?: boolean;
}) {
	const trpc = useTRPC();
	const [query, setQuery] = useState("");
	const [text, setText] = useSearchInput(query, setQuery);
	const [chosen, setChosen] = useState<ComboboxOption | null>(null);
	const contacts = useQuery({
		...trpc.lookout.searchContacts.queryOptions({
			companyId,
			q: query,
			take: 50,
		}),
		placeholderData: (previous) => previous,
	});
	const matches: ComboboxOption[] = (contacts.data?.rows ?? []).map(
		(contact) => ({
			value: contact.id,
			label: `${contact.firstName} ${contact.lastName ?? ""}`.trim(),
			hint: contact.email ?? "Sin correo",
			keywords: contact.email ? [contact.email] : undefined,
		}),
	);
	const empty = { value: NONE, label: "Sin contacto seleccionado" };
	const options = query.trim() ? matches : [empty, ...matches];
	const selectedOption =
		chosen?.value === value
			? chosen
			: (matches.find((option) => option.value === value) ??
				(selected?.id === value
					? {
							value: selected.id,
							label: selected.name,
							hint: selected.email ?? "Sin correo",
						}
					: undefined));

	return (
		<Combobox
			id={id}
			value={value || NONE}
			onValueChange={(next) => {
				setChosen(options.find((option) => option.value === next) ?? null);
				onValueChange(next === NONE ? "" : next);
			}}
			options={options}
			selectedOption={value ? selectedOption : empty}
			disabled={disabled}
			placeholder="Buscar contacto de esta empresa…"
			searchPlaceholder="Nombre, correo o cargo…"
			empty={
				contacts.isFetching ? "Buscando…" : "No hay contactos que coincidan."
			}
			search={text}
			onSearchChange={setText}
			stale={contacts.isFetching || text.trim() !== query.trim()}
		/>
	);
}
