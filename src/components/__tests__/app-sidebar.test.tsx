import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/mail" }));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} onClick={(event) => { event.preventDefault(); onClick?.(event); }} {...props}>{children}</a>
  ),
}));

describe("V2 navigation", () => {
  it("exposes the six stable workspace destinations", () => {
    render(<AppSidebar />);
    for (const [name, href] of [["Hoy", "/today"], ["Proyectos", "/projects"], ["Empresas", "/companies"], ["Contactos", "/contacts"], ["Correo", "/mail"], ["Configuración", "/settings"]]) {
      expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
  });

  it("marks the active section", () => {
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: "Correo" }).getAttribute("aria-current")).toBe("page");
  });

  it("exposes controlled mobile navigation and marks the active destination", () => {
    render(<MobileNav />);

    const trigger = screen.getByRole("button", { name: "Abrir navegación" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Proyectos" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Correo" })).toHaveAttribute("aria-current", "page");
  });

  it("closes mobile navigation after following a destination", () => {
    render(<MobileNav />);

    const trigger = screen.getByRole("button", { name: "Abrir navegación" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("link", { name: "Proyectos" }));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Navegación móvil" })).not.toBeInTheDocument();
  });

  it("closes mobile navigation with Escape and restores focus to its trigger", () => {
    render(<MobileNav />);

    const trigger = screen.getByRole("button", { name: "Abrir navegación" });
    fireEvent.click(trigger);
    screen.getByRole("link", { name: "Proyectos" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
