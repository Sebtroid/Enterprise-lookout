import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { TodayView } from "../today-view";
import { v2DemoSnapshot } from "@/lib/v2/demo-data";

describe("TodayView", () => {
  it("shows only José Miguel attention after selecting his filter", () => {
    render(<TodayView snapshot={v2DemoSnapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "José Miguel" }));

    expect(screen.getByText("Soprole respondió")).toBeVisible();
    expect(screen.queryByText("4 candidatos listos para aprobar")).not.toBeInTheDocument();
  });

  it("shows an empty state when the selected teammate has no attention", () => {
    render(<TodayView snapshot={{ ...v2DemoSnapshot, teammates: ["María"] }} />);

    fireEvent.click(screen.getByRole("button", { name: "María" }));

    expect(screen.getByText("No hay pendientes en este filtro")).toBeVisible();
  });

  it("keeps reserved attention scopes distinct from teammate names", () => {
    const teammateAttention = {
      ...v2DemoSnapshot.attention[0],
      id: "reserved-mine-owner",
      owner: "mine",
      title: "Pendiente del compañero mine",
    };
    render(
      <TodayView
        snapshot={{
          ...v2DemoSnapshot,
          teammates: ["mine"],
          attention: [...v2DemoSnapshot.attention, teammateAttention],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "mine" }));

    expect(screen.getByText("Pendiente del compañero mine")).toBeVisible();
    expect(screen.queryByText("4 candidatos listos para aprobar")).not.toBeInTheDocument();
  });

  it("filters the built-in personal and shared scopes", () => {
    render(<TodayView snapshot={v2DemoSnapshot} />);

    expect(screen.getByText("4 candidatos listos para aprobar")).toBeVisible();
    expect(screen.queryByText("Soprole respondió")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Compartidos" }));
    expect(screen.getByText("3 primeros correos por revisar")).toBeVisible();
    expect(screen.queryByText("Soprole respondió")).not.toBeInTheDocument();
  });
});
