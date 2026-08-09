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

  it("keeps reserved project scopes distinct from teammate names", () => {
    const projects = [
      ...v2DemoSnapshot.projects,
      { ...v2DemoSnapshot.projects[1], id: "owner-mine", name: "Proyecto de mine", ownerName: "mine" },
      { ...v2DemoSnapshot.projects[1], id: "owner-shared", name: "Proyecto de shared", ownerName: "shared" },
    ];
    render(<ProjectsView projects={projects} currentUser="Sebastián" teammates={["mine", "shared"]} />);

    fireEvent.click(screen.getByRole("button", { name: "mine" }));

    expect(screen.getByText("Proyecto de mine")).toBeVisible();
    expect(screen.queryByText("Bienvenida novatos 2027")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "shared" }));

    expect(screen.getByText("Proyecto de shared")).toBeVisible();
    expect(screen.queryByText("Asado 18 de septiembre")).not.toBeInTheDocument();
  });

  it("filters the built-in personal and shared scopes", () => {
    render(<ProjectsView projects={v2DemoSnapshot.projects} currentUser="Sebastián" teammates={["José Miguel"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Propios" }));
    expect(screen.getByText("Bienvenida novatos 2027")).toBeVisible();
    expect(screen.queryByText("Pastoral Invierno 2026")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Compartidos" }));
    expect(screen.getByText("Asado 18 de septiembre")).toBeVisible();
    expect(screen.queryByText("Bienvenida novatos 2027")).not.toBeInTheDocument();
  });
});
