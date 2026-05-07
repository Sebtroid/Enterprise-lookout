import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/app-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/campaigns/all/pipeline",
}));

describe("AppSidebar", () => {
  it("uses native navigation for changing projects so it works during route transitions", () => {
    render(<AppSidebar />);

    const changeProject = screen.getByRole("link", {
      name: "Cambiar proyecto",
    });

    expect(changeProject.getAttribute("href")).toBe("/campaigns");
    expect(changeProject.getAttribute("data-native-navigation")).toBe("true");
  });
});
