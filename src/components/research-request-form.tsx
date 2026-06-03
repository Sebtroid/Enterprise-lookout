"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SearchCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  createResearchRequestAction,
  type ActionState,
} from "@/features/prospecting/actions";
import type { AppCampaign } from "@/lib/prospecting/demo-data";

const initialActionState: ActionState = { ok: false, message: "" };

export function ResearchRequestForm({
  campaign,
  scope,
}: {
  campaign: AppCampaign | null;
  scope: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    createResearchRequestAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  if (!campaign) {
    return (
      <section className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Entra a un proyecto concreto para pedir investigación profunda.
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <form action={formAction} className="space-y-3">
        <input name="scope" type="hidden" value={scope} />

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <SearchCheck className="size-4" />
              Investigar empresas nuevas
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              KimiClaw debe buscar empresas con evidencia y contactos directos:
              persona, cargo, fuente y mail verificado o inferido como no verificado.
            </p>
          </div>
          <label className="space-y-1 text-sm md:w-56">
            <span className="font-medium">Prioridad</span>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              defaultValue="existing_and_new"
              name="sourceMode"
            >
              <option value="existing_and_new">Base + nuevas</option>
              <option value="new_companies">Principalmente nuevas</option>
              <option value="existing_only">Solo base existente</option>
            </select>
          </label>
        </div>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Rubros o empresas a investigar</span>
          <Textarea
            className="min-h-24"
            name="rubrics"
            placeholder="Ej: hidratación, bebidas isotónicas, comida rápida, marcas deportivas, premios para torneo, activaciones universitarias..."
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Criterios extra</span>
          <Textarea
            className="min-h-20"
            name="notes"
            placeholder="Ej: prioriza gerentes de asuntos corporativos, sostenibilidad/RSE, comunicaciones, fundaciones o partnerships. Evita info@ y contacto@ salvo como fallback."
          />
        </label>

        {state.message ? <ActionMessage state={state} /> : null}

        <div className="flex justify-end">
          <Button disabled={isPending} type="submit">
            {isPending ? "Guardando" : "Pedir investigación"}
          </Button>
        </div>
      </form>
    </section>
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
