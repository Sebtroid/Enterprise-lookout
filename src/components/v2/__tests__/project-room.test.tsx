import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { v2DemoSnapshot } from "@/lib/v2/demo-data";

import { ProjectRoom } from "../project-room";

describe("ProjectRoom", () => {
  it("renders a specific state for activity instead of the summary panel", () => {
    render(
      <ProjectRoom
        project={v2DemoSnapshot.projects[0]}
        companies={v2DemoSnapshot.companies}
        activeTab="activity"
      />,
    );

    expect(screen.getByText("La actividad aparecerá aquí")).toBeVisible();
    expect(screen.queryByText("Siguiente mejor acción")).not.toBeInTheDocument();
  });

  it.each([
    ["mail", "El correo del proyecto aparecerá aquí"],
    ["files", "Los archivos y enlaces aparecerán aquí"],
  ])("renders a truthful %s state instead of falling through to summary", (activeTab, message) => {
    render(
      <ProjectRoom
        project={v2DemoSnapshot.projects[0]}
        companies={v2DemoSnapshot.companies}
        activeTab={activeTab}
      />,
    );

    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByText("Siguiente mejor acción")).not.toBeInTheDocument();
  });
});
