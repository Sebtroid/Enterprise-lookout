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
});
