"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  createDomTaskAction,
  type ActionState,
} from "@/features/prospecting/actions";

const initialActionState: ActionState = { ok: false, message: "" };

export function DomTaskForm({ scope }: { scope: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>(initialActionState);
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createDomTaskAction(initialActionState, formData);
      setState(result);
      if (result.ok) {
        setOpen(false);
      }
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <Button type="button" onClick={() => setOpen((current) => !current)}>
        <Plus className="size-4" />
        Tarea para Dom
      </Button>

      {open ? (
        <div className="absolute right-0 top-10 z-30 max-h-[calc(100vh-8rem)] w-[min(92vw,34rem)] overflow-y-auto rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg">
          <form action={onSubmit} className="space-y-3">
            <input name="scope" type="hidden" value={scope} />
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <Bot className="size-4" />
                Nueva tarea para Dom
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Queda registrada en esta campaña y se envía al endpoint de Dom.
              </p>
            </div>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Qué quieres que haga</span>
              <Textarea
                className="h-36 min-h-0 resize-none [field-sizing:fixed]"
                name="description"
                placeholder="Ej: Busca empresas de chocolates para premios y propone contactos de marketing."
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Contexto extra</span>
              <Textarea
                className="h-24 min-h-0 resize-none [field-sizing:fixed]"
                name="context"
                placeholder="Ej: prioriza marcas que puedan entregar producto y que tengan presencia joven/universitaria."
              />
            </label>
            {state.message ? <ActionMessage state={state} /> : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? "Creando" : "Crear tarea"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
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
