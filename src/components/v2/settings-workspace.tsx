"use client";

import { Bot, KeyRound, Mail, ShieldCheck, Users, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { V2ProviderState, V2SettingsSnapshot } from "@/lib/v2/types";

type SettingsWorkspaceProps = {
  settings: V2SettingsSnapshot;
  budget: { spentUsd: number; limitUsd: number };
  isDemo: boolean;
};

const providerStateLabels: Record<V2ProviderState, string> = {
  connected: "Conectado",
  not_configured: "No configurado",
  action_required: "Requiere acción",
  unavailable: "No disponible",
};

const providerStateVariants: Record<V2ProviderState, "default" | "outline" | "secondary" | "destructive"> = {
  connected: "default",
  not_configured: "outline",
  action_required: "secondary",
  unavailable: "destructive",
};

const demoSaveMessage = "Conecta Supabase para guardar este cambio.";
const unavailableSaveMessage = "Este cambio necesita una conexión de configuración disponible.";

export function SettingsWorkspace({ settings, budget, isDemo }: SettingsWorkspaceProps) {
  const [budgetLimit, setBudgetLimit] = useState(String(budget.limitUsd));
  const [message, setMessage] = useState("");
  const [secretEditor, setSecretEditor] = useState<{ id: string; name: string } | null>(null);
  const [secretValue, setSecretValue] = useState("");
  const secretInputRef = useRef<HTMLInputElement>(null);
  const percentage = budget.limitUsd > 0 ? Math.min((budget.spentUsd / budget.limitUsd) * 100, 100) : 0;

  function reportUnavailableSave() {
    setMessage(isDemo ? demoSaveMessage : unavailableSaveMessage);
  }

  function openSecretEditor(secret: { id: string; name: string }) {
    setSecretValue("");
    setSecretEditor(secret);
  }

  function closeSecretEditor() {
    setSecretValue("");
    setSecretEditor(null);
  }

  return (
    <Dialog onOpenChange={(open) => { if (!open) closeSecretEditor(); }}>
      <div className="space-y-6">
      <SettingsSection icon={Users} title="Equipo">
        {settings.team.length > 0 ? settings.team.map((member) => (
          <SettingsRow key={member.id} title={member.name} detail={member.role} stateLabel={member.status} />
        )) : <EmptyRow>No hay miembros activos.</EmptyRow>}
        <div className="pt-3">
          <Button type="button" variant="outline" size="sm" onClick={reportUnavailableSave}>Invitar miembro</Button>
        </div>
      </SettingsSection>

      <SettingsSection icon={Mail} title="Cuentas de correo">
        {settings.mailProviders.map((provider) => (
          <SettingsRow
            key={provider.id}
            title={provider.name}
            detail={provider.accounts.length > 0
              ? provider.accounts.map((account) => account.email).join(" · ")
              : provider.id === "gmail" ? "Sin cuentas Gmail conectadas" : "Sin cuentas Microsoft 365 conectadas"}
            state={provider.state}
            actions={!isDemo && provider.actionHref
              ? <a href={provider.actionHref} className={buttonVariants({ variant: "outline", size: "sm" })}>Conectar {provider.name}</a>
              : <Button type="button" variant="outline" size="sm" onClick={reportUnavailableSave}>Conectar {provider.name}</Button>}
          />
        ))}
      </SettingsSection>

      <SettingsSection icon={Bot} title="Integraciones">
        {settings.integrations.map((integration) => (
          <SettingsRow
            key={integration.id}
            title={integration.name}
            detail={integration.detail}
            state={integration.state}
            actions={(
              <>
                <Button type="button" variant="outline" size="sm" onClick={reportUnavailableSave}>Configurar {integration.name}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={reportUnavailableSave}>Probar {integration.name}</Button>
              </>
            )}
          />
        ))}
      </SettingsSection>

      <SettingsSection icon={ShieldCheck} title="Caja fuerte">
        <p className="pb-2 text-sm text-muted-foreground">El cliente recibe solamente el estado de cada secreto, nunca su valor.</p>
        {settings.vault.map((secret) => (
          <SettingsRow
            key={secret.id}
            title={secret.name}
            detail="Acceso restringido a propietarios"
            state={secret.state}
            actions={(
              <>
                {secret.canReveal ? <Button type="button" variant="ghost" size="sm" className="w-full whitespace-normal sm:w-auto" onClick={reportUnavailableSave}>Revelar {secret.name}</Button> : null}
                {secret.canReplace ? (
                  <DialogTrigger render={<Button type="button" variant="outline" size="sm" className="w-full whitespace-normal sm:w-auto" onClick={() => openSecretEditor(secret)} />}>
                    Reemplazar {secret.name}
                  </DialogTrigger>
                ) : null}
              </>
            )}
          />
        ))}
      </SettingsSection>

      <SettingsSection icon={WalletCards} title="Presupuesto">
        <form className="space-y-4 pt-3" onSubmit={(event) => { event.preventDefault(); reportUnavailableSave(); }}>
          <div className="max-w-xs space-y-2">
            <label htmlFor="minimax-monthly-budget" className="text-sm font-medium">Presupuesto mensual de MiniMax en USD</label>
            <Input id="minimax-monthly-budget" name="minimaxMonthlyBudget" type="number" min="0" step="0.01" value={budgetLimit} onChange={(event) => setBudgetLimit(event.target.value)} />
          </div>
          <Progress value={percentage} aria-label="Uso del presupuesto mensual de MiniMax" aria-valuetext={`${Math.round(percentage)}%`} />
          <p className="text-sm text-muted-foreground">
            USD {budget.spentUsd.toFixed(2)} usados de USD {budget.limitUsd.toFixed(2)}. Se avisa al 80% y se detienen nuevos trabajos al 100%.
          </p>
          <Button type="submit">Guardar presupuesto</Button>
        </form>
      </SettingsSection>

        {message ? <p role="status" className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">{message}</p> : null}
      </div>

      {secretEditor ? (
        <DialogContent initialFocus={secretInputRef} showCloseButton={false}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              <DialogTitle>Reemplazar secreto</DialogTitle>
            </div>
            <DialogDescription>Reemplaza {secretEditor.name}. El valor nunca se incluye en la vista de configuración.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); reportUnavailableSave(); }}>
            <div className="space-y-2">
              <label htmlFor={`secret-${secretEditor.id}`} className="text-sm font-medium">Nuevo valor para {secretEditor.name}</label>
              <Input
                ref={secretInputRef}
                id={`secret-${secretEditor.id}`}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={secretValue}
                onChange={(event) => setSecretValue(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">El valor queda en blanco al cerrar.</p>
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancelar reemplazo</DialogClose>
              <DialogClose render={<Button type="submit" />}>Guardar secreto</DialogClose>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function SettingsSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="w-full rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="mt-4 divide-y divide-border">{children}</div>
    </section>
  );
}

function SettingsRow({ title, detail, state, stateLabel, actions }: {
  title: string;
  detail: string;
  state?: V2ProviderState;
  stateLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="break-words text-sm font-medium [overflow-wrap:anywhere]">{title}</div>
        <div className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{detail}</div>
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
        {state ? <ProviderState state={state} /> : stateLabel ? <Badge variant="outline">{stateLabel}</Badge> : null}
        {actions}
      </div>
    </div>
  );
}

function ProviderState({ state }: { state: V2ProviderState }) {
  return <Badge variant={providerStateVariants[state]}>{providerStateLabels[state]}</Badge>;
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-muted-foreground">{children}</p>;
}
