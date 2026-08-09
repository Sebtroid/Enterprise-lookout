import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "../segmented-control";

describe("SegmentedControl", () => {
  it("announces and changes the active option", async () => {
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
});
