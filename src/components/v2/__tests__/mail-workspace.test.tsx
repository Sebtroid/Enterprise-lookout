import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MailWorkspace } from "../mail-workspace";
import { v2DemoSnapshot } from "@/lib/v2/demo-data";

describe("MailWorkspace", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("filters unread conversations and identifies Microsoft accounts", () => {
    render(<MailWorkspace threads={v2DemoSnapshot.threads} />);

    fireEvent.click(screen.getByRole("button", { name: "No leídas" }));

    expect(screen.getByRole("button", { name: /Soprole/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /PF Alimentos/ })).not.toBeInTheDocument();
    expect(screen.getByText("Microsoft 365")).toBeVisible();
  });

  it("requires approval before exposing the send action", () => {
    render(<MailWorkspace threads={v2DemoSnapshot.threads} initialThreadId="thread-pf" />);

    expect(screen.queryByRole("button", { name: "Enviar ahora" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar borrador" }));
    expect(screen.getByRole("button", { name: "Enviar ahora" })).toBeVisible();
  });

  it("filters drafts by the exact selected account", () => {
    const threads = [
      { ...v2DemoSnapshot.threads[0], account: "microsoft@uc.cl" },
      { ...v2DemoSnapshot.threads[1], account: "gmail@uc.cl", draftStatus: "draft" as const },
    ];

    render(<MailWorkspace threads={threads} />);

    fireEvent.click(screen.getByRole("button", { name: "Borradores" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Cuenta" }), { target: { value: "gmail@uc.cl" } });

    expect(screen.getByRole("button", { name: /PF Alimentos/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Soprole/ })).not.toBeInTheDocument();
  });

  it("shows the active sender as non-editable information", () => {
    render(<MailWorkspace threads={v2DemoSnapshot.threads} />);

    expect(screen.getByText("Desde")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Remitente" })).not.toBeInTheDocument();
  });

  it("keeps the active thread unchanged while an approval request is pending", async () => {
    let resolveSave: (response: Response) => void;
    const savePending = new Promise<Response>((resolve) => { resolveSave = resolve; });
    const fetchMock = vi.fn().mockImplementationOnce(() => savePending).mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const threads = v2DemoSnapshot.threads.map((thread) => thread.id === "thread-pf" ? { ...thread, draftId: "draft-pf" } : thread);

    render(<MailWorkspace threads={threads} initialThreadId="thread-pf" />);
    fireEvent.click(screen.getByRole("button", { name: "Aprobar borrador" }));
    fireEvent.click(screen.getByRole("button", { name: /Soprole/ }));

    expect(screen.getByRole("heading", { name: /Asado universitario/ })).toBeVisible();

    await act(async () => { resolveSave!(new Response(null, { status: 200 })); });
  });

  it("does not offer a real send for a demo draft without persistence", () => {
    render(<MailWorkspace threads={v2DemoSnapshot.threads} initialThreadId="thread-pf" />);

    fireEvent.click(screen.getByRole("button", { name: "Aprobar borrador" }));

    expect(screen.getByRole("button", { name: "Enviar ahora" })).toBeDisabled();
    expect(screen.getByText("Borrador de demostración: no se enviará desde esta pantalla.")).toBeVisible();
  });

  it("wraps draft actions on narrow screens", () => {
    render(<MailWorkspace threads={v2DemoSnapshot.threads} />);

    expect(screen.getByLabelText("Acciones del borrador")).toHaveClass("flex-wrap");
  });
});
