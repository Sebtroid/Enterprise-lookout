import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "../segmented-control";

describe("SegmentedControl", () => {
  it("announces and changes the active option", () => {
    const onChange = vi.fn();

    render(
      <SegmentedControl
        label="Filtrar proyectos"
        value="all"
        options={[
          { value: "all", label: "Todos" },
          { value: "shared", label: "Compartidos" },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Compartidos" }));

    expect(onChange).toHaveBeenCalledWith("shared");
  });

  it("moves focus and selection between options with arrow keys", () => {
    const onChange = vi.fn();

    render(
      <SegmentedControl
        label="Filtrar proyectos"
        value="all"
        options={[
          { value: "all", label: "Todos" },
          { value: "mine", label: "Propios" },
          { value: "shared", label: "Compartidos" },
        ]}
        onChange={onChange}
      />,
    );

    const all = screen.getByRole("button", { name: "Todos" });
    const mine = screen.getByRole("button", { name: "Propios" });
    all.focus();
    fireEvent.keyDown(all, { key: "ArrowRight" });

    expect(mine).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith("mine");
  });
});
