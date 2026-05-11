"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createSenderAction,
  type ActionState,
} from "@/features/prospecting/actions";
import type { AppCampaign } from "@/lib/prospecting/demo-data";

const initialActionState: ActionState = { ok: false, message: "" };

export function SenderForm({
  campaigns,
  scope,
}: {
  campaigns: AppCampaign[];
  scope: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createSenderAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="relative">
      <Button type="button" onClick={() => setOpen((current) => !current)}>
        <Plus className="size-4" />
        Agregar remitente
      </Button>

      {open ? (
        <div className="absolute right-0 top-10 z-30 w-[min(92vw,34rem)] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg">
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="scope" value={scope} />
            <div>
              <h2 className="font-semibold">Agregar remitente</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Guarda la cuenta y su relación con el proyecto.
              </p>
            </div>

            {scope === "all" ? (
              <Field label="Proyecto">
                <select
                  className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  name="campaignSlug"
                  required
                >
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email">
                <Input name="email" required type="email" />
              </Field>
              <Field label="Nombre visible">
                <Input name="displayName" required />
              </Field>
              <Field label="Organización">
                <Input name="organization" />
              </Field>
              <Field label="Proveedor">
                <select
                  className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  name="accountType"
                  defaultValue="outlook"
                >
                  <option value="outlook">Outlook / Microsoft 365</option>
                  <option value="gmail">Gmail</option>
                  <option value="smtp">SMTP</option>
                  <option value="manual">Manual</option>
                </select>
              </Field>
              <Field label="Estado">
                <select
                  className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  name="status"
                  defaultValue="active"
                >
                  <option value="active">Activo</option>
                  <option value="paused">Pausado</option>
                  <option value="disabled">Deshabilitado</option>
                </select>
              </Field>
              <Field label="Límite diario cuenta">
                <Input name="dailyLimit" type="number" min={1} defaultValue={15} />
              </Field>
              <Field label="Límite diario proyecto">
                <Input
                  name="campaignDailyLimit"
                  type="number"
                  min={1}
                  defaultValue={15}
                />
              </Field>
            </div>

            <Field label="Firma">
              <Textarea name="signature" className="min-h-24" />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input name="isDefault" type="checkbox" defaultChecked />
              Dejar como remitente default para este proyecto
            </label>

            {state.message ? <ActionMessage state={state} /> : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? "Guardando" : "Guardar remitente"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  return (
    <div
      className={
        state.ok
          ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          : "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
      }
    >
      {state.message}
    </div>
  );
}
