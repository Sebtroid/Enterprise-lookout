import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/app-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/campaigns/all/pipeline",
}));

describe("AppSidebar", () => {
  it("links directly to the project picker", () => {
    render(<AppSidebar />);

    const changeProject = screen.getByRole("link", {
      name: "Cambiar proyecto",
    });

    expect(changeProject.getAttribute("href")).toBe("/campaigns");
  });
});
