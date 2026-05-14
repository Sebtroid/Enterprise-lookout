import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/campaigns/all/pipeline",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean | null;
    children: ReactNode;
  }) => (
    <a
      href={href}
      data-next-prefetch={
        prefetch === undefined || prefetch === null ? "auto" : String(prefetch)
      }
      {...props}
    >
      {children}
    </a>
  ),
}));

describe("AppSidebar", () => {
  it("links directly to the project picker", () => {
    render(<AppSidebar />);

    const changeProject = screen.getByRole("link", {
      name: "Cambiar proyecto",
    });

    expect(changeProject.getAttribute("href")).toBe("/campaigns");
  });

  it("disables prefetching for dynamic dashboard routes", () => {
    render(<AppSidebar />);

    const dashboardLinks = screen
      .getAllByRole("link")
      .filter((link) =>
        link.getAttribute("href")?.startsWith("/campaigns/all"),
      );

    expect(dashboardLinks.length).toBeGreaterThan(0);
    for (const link of dashboardLinks) {
      expect(link.getAttribute("data-next-prefetch")).toBe("false");
    }
  });

  it("includes the company overview route for the active project scope", () => {
    render(<AppSidebar />);

    expect(
      screen.getByRole("link", { name: "Overview" }).getAttribute("href"),
    ).toBe("/campaigns/all/overview");
  });
});

describe("MobileNav", () => {
  it("disables prefetching for dynamic dashboard routes", () => {
    render(<MobileNav />);

    const dashboardLinks = screen
      .getAllByRole("link")
      .filter((link) =>
        link.getAttribute("href")?.startsWith("/campaigns/all"),
      );

    expect(dashboardLinks.length).toBeGreaterThan(0);
    for (const link of dashboardLinks) {
      expect(link.getAttribute("data-next-prefetch")).toBe("false");
    }
  });
});
