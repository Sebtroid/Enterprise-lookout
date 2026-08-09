import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { MailWorkspace } from "../mail-workspace";
import { v2DemoSnapshot } from "@/lib/v2/demo-data";

describe("MailWorkspace", () => {
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

  it("shows a sender selector only when multiple accounts are eligible", () => {
    const [first] = v2DemoSnapshot.threads;

    const { rerender } = render(<MailWorkspace threads={[first]} />);
    expect(screen.queryByRole("combobox", { name: "Remitente" })).not.toBeInTheDocument();

    rerender(<MailWorkspace threads={v2DemoSnapshot.threads} />);
    expect(screen.getByRole("combobox", { name: "Remitente" })).toBeVisible();
  });
});
