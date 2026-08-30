import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsWorkspace } from "../settings-workspace";
import type { V2SettingsSnapshot } from "@/lib/v2/types";

const demoSettingsSnapshot: V2SettingsSnapshot = {
  team: [
    { id: "demo-user", name: "Sebastián", role: "Propietario", status: "Activo" },
  ],
  mailProviders: [
    { id: "gmail", name: "Gmail", state: "not_configured" as const, accounts: [], actionHref: "/api/gmail?action=connect" },
    { id: "microsoft", name: "Microsoft 365", state: "action_required" as const, accounts: [] },
  ],
  integrations: [
    { id: "minimax", name: "MiniMax", detail: "Investigación asistida", state: "not_configured" as const },
    { id: "hunter", name: "Hunter", detail: "Verificación de contactos", state: "not_configured" as const },
  ],
  vault: [
    { id: "supabase-db-password", name: "Contraseña de base de datos Supabase", state: "unavailable" as const, canReveal: false, canReplace: true },
  ],
};

describe("SettingsWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Gmail, Microsoft 365, integrations, Vault and budget", () => {
    render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 1.82, limitUsd: 5 }} isDemo />);

    expect(screen.getByRole("heading", { name: "Cuentas de correo" })).toBeVisible();
    expect(screen.getByText("Microsoft 365")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Integraciones" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Caja fuerte" })).toBeVisible();
    expect(screen.getByLabelText("Presupuesto mensual de MiniMax en USD")).toHaveValue(5);
    expect(screen.getByRole("progressbar", { name: "Uso del presupuesto mensual de MiniMax" })).toHaveAttribute("aria-valuetext", "36%");
  });

  it("does not pretend to persist settings in demo mode", () => {
    render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 1.82, limitUsd: 5 }} isDemo />);

    fireEvent.change(screen.getByLabelText("Presupuesto mensual de MiniMax en USD"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar presupuesto" }));

    expect(screen.getByRole("status")).toHaveTextContent("Conecta Supabase para guardar este cambio.");
    expect(screen.getByRole("status")).not.toHaveTextContent(/guardado|actualizado/i);
  });

  it("keeps the Gmail OAuth action available outside demo mode", () => {
    render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 1.82, limitUsd: 5 }} isDemo={false} />);

    expect(screen.getByRole("link", { name: "Conectar Gmail" })).toHaveAttribute("href", "/api/gmail?action=connect");
    expect(screen.queryByRole("button", { name: "Conectar Gmail" })).not.toBeInTheDocument();
  });

  it("intercepts the Gmail OAuth action honestly in demo mode", () => {
    render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 1.82, limitUsd: 5 }} isDemo />);

    expect(screen.queryByRole("link", { name: "Conectar Gmail" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conectar Gmail" }));
    expect(screen.getByRole("status")).toHaveTextContent("Conecta Supabase para guardar este cambio.");
  });

  it("clears replacement secrets when the editor closes", () => {
    render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 1.82, limitUsd: 5 }} isDemo />);

    fireEvent.click(screen.getByRole("button", { name: "Reemplazar Contraseña de base de datos Supabase" }));
    const secretInput = screen.getByLabelText("Nuevo valor para Contraseña de base de datos Supabase");
    expect(secretInput).toHaveAttribute("autocomplete", "new-password");
    expect(secretInput).toHaveValue("");
    fireEvent.change(secretInput, { target: { value: "valor-solo-para-la-prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar reemplazo" }));

    fireEvent.click(screen.getByRole("button", { name: "Reemplazar Contraseña de base de datos Supabase" }));
    expect(screen.getByLabelText("Nuevo valor para Contraseña de base de datos Supabase")).toHaveValue("");
  });

  it("moves focus into the secret dialog and restores it after Escape", async () => {
    render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 1.82, limitUsd: 5 }} isDemo />);

    const trigger = screen.getByRole("button", { name: "Reemplazar Contraseña de base de datos Supabase" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Reemplazar secreto" });
    const secretInput = screen.getByLabelText("Nuevo valor para Contraseña de base de datos Supabase");
    expect(dialog).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Equipo" })).not.toBeInTheDocument();
    await waitFor(() => expect(secretInput).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reemplazar secreto" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps long Vault actions available at narrow widths", () => {
    render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 1.82, limitUsd: 5 }} isDemo />);

    const replaceButton = screen.getByRole("button", { name: "Reemplazar Contraseña de base de datos Supabase" });
    expect(replaceButton).toHaveClass("w-full", "whitespace-normal", "sm:w-auto");
    expect(replaceButton.parentElement).toHaveClass("w-full", "min-w-0", "sm:w-auto");
  });

  it("persists a live budget and reports success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ limitUsd: 8 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 1.82, limitUsd: 5 }} isDemo={false} />);

    fireEvent.change(screen.getByLabelText("Presupuesto mensual de MiniMax en USD"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar presupuesto" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Presupuesto guardado"));
    expect(fetchMock).toHaveBeenCalledWith("/api/v2/settings/budget", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ limitUsd: 8 }),
    }));
    expect(screen.getByText(/USD 1\.82 usados de USD 8\.00/)).toBeVisible();
  });

  it("shows an exhausted budget when the limit is zero and spend exists", () => {
    render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 0.5, limitUsd: 0 }} isDemo />);
    expect(screen.getByRole("progressbar", { name: "Uso del presupuesto mensual de MiniMax" })).toHaveAttribute("aria-valuetext", "100%");
  });

  it("replaces a live secret without keeping its value in the client dialog", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ key: "supabase-db-password", configured: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsWorkspace settings={demoSettingsSnapshot} budget={{ spentUsd: 0, limitUsd: 5 }} isDemo={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Reemplazar Contraseña de base de datos Supabase" }));
    const input = screen.getByLabelText("Nuevo valor para Contraseña de base de datos Supabase");
    fireEvent.change(input, { target: { value: "test-only-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar secreto" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reemplazar secreto" })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/v2/settings/vault/replace", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ key: "supabase-db-password", value: "test-only-secret" }),
    }));
    expect(screen.getByRole("status")).toHaveTextContent("Secreto guardado");

    fireEvent.click(screen.getByRole("button", { name: "Reemplazar Contraseña de base de datos Supabase" }));
    expect(screen.getByLabelText("Nuevo valor para Contraseña de base de datos Supabase")).toHaveValue("");
  });

  it("reveals a configured live secret on demand and clears it when closed", async () => {
    const liveSettings: V2SettingsSnapshot = {
      ...demoSettingsSnapshot,
      vault: demoSettingsSnapshot.vault.map((secret) => ({ ...secret, state: "connected", canReveal: true })),
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ key: "supabase-db-password", value: "revealed-test-value" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<SettingsWorkspace settings={liveSettings} budget={{ spentUsd: 0, limitUsd: 5 }} isDemo={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Revelar Contraseña de base de datos Supabase" }));
    await waitFor(() => expect(screen.getByDisplayValue("revealed-test-value")).toBeVisible());
    expect(fetchMock).toHaveBeenCalledWith("/api/v2/settings/vault/reveal", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ key: "supabase-db-password" }),
    }));

    fireEvent.click(screen.getByRole("button", { name: "Cerrar secreto revelado" }));
    await waitFor(() => expect(screen.queryByDisplayValue("revealed-test-value")).not.toBeInTheDocument());
  });
});
