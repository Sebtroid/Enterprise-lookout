"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createLeadAction,
  type ActionState,
} from "@/features/prospecting/actions";
import type { AppCampaign } from "@/lib/prospecting/demo-data";

const initialActionState: ActionState = { ok: false, message: "" };

export function NewLeadForm({
  campaigns,
  scope,
}: {
  campaigns: AppCampaign[];
  scope: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createLeadAction,
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
        Nuevo lead
      </Button>

      {open ? (
        <div className="absolute right-0 top-10 z-30 w-[min(92vw,34rem)] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg">
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="scope" value={scope} />
            <div>
              <h2 className="font-semibold">Nuevo lead</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Crea empresa, contacto y vínculo con campaña.
              </p>
            </div>

            {scope === "all" ? (
              <Field label="Campaña">
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
              <Field label="Empresa">
                <Input name="companyName" required />
              </Field>
              <Field label="Dominio">
                <Input name="domain" placeholder="empresa.cl" />
              </Field>
              <Field label="Sitio web">
                <Input name="website" placeholder="https://..." />
              </Field>
              <Field label="Fuente">
                <Input name="source" defaultValue="dashboard" />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contacto">
                <Input name="contactName" required />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" />
              </Field>
            </div>

            <Field label="Cargo">
              <Input name="role" />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input name="isDecisionMaker" type="checkbox" />
              Es decisor o contacto prioritario
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
                {isPending ? "Guardando" : "Crear lead"}
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
