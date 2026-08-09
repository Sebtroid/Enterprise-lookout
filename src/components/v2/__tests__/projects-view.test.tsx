import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { ProjectsView } from "../projects-view";
import { v2DemoSnapshot } from "@/lib/v2/demo-data";

describe("ProjectsView", () => {
  it("filters personal projects owned by the teammate", () => {
    render(<ProjectsView projects={v2DemoSnapshot.projects} currentUser="Sebastián" teammates={["José Miguel"]} />);

    fireEvent.click(screen.getByRole("button", { name: "José Miguel" }));

    expect(screen.getByText("Pastoral Invierno 2026")).toBeVisible();
    expect(screen.queryByText("Bienvenida novatos 2027")).not.toBeInTheDocument();
  });
});
