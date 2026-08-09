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

  it("persists an explicitly eligible sender selection and resets approval", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "draft-pf", status: "needs_review" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const thread = {
      ...v2DemoSnapshot.threads[1],
      draftId: "draft-pf",
      draftStatus: "approved" as const,
      senderIdentityId: "11111111-1111-4111-8111-111111111111",
      eligibleSenders: [
        { senderIdentityId: "11111111-1111-4111-8111-111111111111", email: "colaboraciones@uc.cl", provider: "gmail" as const },
        { senderIdentityId: "22222222-2222-4222-8222-222222222222", email: "alianzas@uc.cl", provider: "gmail" as const },
      ],
    };

    render(<MailWorkspace threads={[thread]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Remitente" }), { target: { value: "22222222-2222-4222-8222-222222222222" } });

    await screen.findByRole("button", { name: "Aprobar borrador" });
    expect(fetchMock).toHaveBeenCalledWith("/api/v2/mail/drafts/draft-pf", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ senderIdentityId: "22222222-2222-4222-8222-222222222222" }) }));
    expect(screen.getByRole("combobox", { name: "Remitente" })).toHaveValue("22222222-2222-4222-8222-222222222222");
  });

  it("keeps the previous sender when an authorized selection fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "sender_not_authorized" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const thread = {
      ...v2DemoSnapshot.threads[1],
      draftId: "draft-pf",
      senderIdentityId: "11111111-1111-4111-8111-111111111111",
      eligibleSenders: [
        { senderIdentityId: "11111111-1111-4111-8111-111111111111", email: "colaboraciones@uc.cl", provider: "gmail" as const },
        { senderIdentityId: "22222222-2222-4222-8222-222222222222", email: "alianzas@uc.cl", provider: "gmail" as const },
      ],
    };

    render(<MailWorkspace threads={[thread]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Remitente" }), { target: { value: "22222222-2222-4222-8222-222222222222" } });

    await screen.findByRole("status");
    expect(screen.getByRole("combobox", { name: "Remitente" })).toHaveValue("11111111-1111-4111-8111-111111111111");
    expect(screen.getByRole("status")).toHaveTextContent("No se pudo cambiar el remitente.");
  });

  it("lets a persisted unassigned draft choose from explicit eligible senders", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "draft-pf", status: "needs_review" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const thread = {
      ...v2DemoSnapshot.threads[1],
      draftId: "draft-pf",
      eligibleSenders: [
        { senderIdentityId: "11111111-1111-4111-8111-111111111111", email: "colaboraciones@uc.cl", provider: "gmail" as const },
        { senderIdentityId: "22222222-2222-4222-8222-222222222222", email: "alianzas@uc.cl", provider: "gmail" as const },
      ],
    };

    render(<MailWorkspace threads={[thread]} />);

    const sender = screen.getByRole("combobox", { name: "Remitente" });
    expect(sender).toHaveValue("");
    fireEvent.change(sender, { target: { value: "22222222-2222-4222-8222-222222222222" } });

    await screen.findByRole("button", { name: "Aprobar borrador" });
    expect(sender).toHaveValue("22222222-2222-4222-8222-222222222222");
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
