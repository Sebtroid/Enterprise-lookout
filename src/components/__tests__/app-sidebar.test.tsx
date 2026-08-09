import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/mail" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
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

  it("keeps all destinations reachable on mobile", () => {
    render(<MobileNav />);
    expect(screen.getByRole("link", { name: "Proyectos" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Correo" })).toBeTruthy();
  });
});
