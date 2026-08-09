import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { CompaniesDirectory } from "../companies-directory";
import { v2DemoSnapshot } from "@/lib/v2/demo-data";

describe("CompaniesDirectory", () => {
  it("finds a company without requiring accents or exact case", () => {
    render(<CompaniesDirectory companies={v2DemoSnapshot.companies} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar empresas" }), { target: { value: "preferida" } });

    expect(screen.getByText("La Preferida")).toBeVisible();
    expect(screen.queryByText("Soprole")).not.toBeInTheDocument();
  });
});
