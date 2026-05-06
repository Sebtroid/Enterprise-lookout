"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createProjectAction,
  type ActionState,
} from "@/features/prospecting/actions";

const initialActionState: ActionState = { ok: false, message: "" };

export function ProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createProjectAction,
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
        <FolderPlus className="size-4" />
        Nuevo proyecto
      </Button>

      {open ? (
        <div className="absolute right-0 top-10 z-30 w-[min(92vw,38rem)] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg">
          <form action={formAction} className="space-y-3">
            <div>
              <h2 className="font-semibold">Nuevo proyecto</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Define el contexto para que empresas, mails y respuestas queden separados.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <Input
                  name="name"
                  placeholder="Liga SCI, Gala, Torneo de pádel..."
                  required
                />
              </Field>
              <Field label="Organización/contexto">
                <Input
                  name="organization"
                  placeholder="CAA U Andes, Trabajo País..."
                  required
                />
              </Field>
              <Field label="Fecha estimada">
                <Input name="startsOn" type="date" />
              </Field>
              <Field label="Remitente default">
                <Input
                  name="senderEmail"
                  defaultValue="sawitting@miuandes.cl"
                  type="email"
                />
              </Field>
            </div>

            <Field label="Qué es el proyecto">
              <Textarea
                className="min-h-28"
                name="description"
                placeholder="Ej: Liga de Ingeniería del CDI con 110 personas, 10 equipos y cerca de 20 partidos. Explica la dinámica, público, fechas y por qué alguien querría estar presente."
                required
              />
            </Field>

            <Field label="Qué se necesita conseguir">
              <Textarea
                className="min-h-24"
                name="valueProposition"
                placeholder="Ej: auspicios para hidratación, comida, premios, copete, activaciones o aporte en especie..."
                required
              />
            </Field>

            <label className="space-y-1 text-sm">
              <span className="font-medium">Estado</span>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                name="status"
                defaultValue="active"
              >
                <option value="active">Activo</option>
                <option value="draft">Borrador</option>
                <option value="paused">Pausado</option>
              </select>
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
                {isPending ? "Creando" : "Crear proyecto"}
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
