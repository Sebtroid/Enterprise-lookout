import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { ContactsDirectory } from "../contacts-directory";
import { v2DemoSnapshot } from "@/lib/v2/demo-data";

describe("ContactsDirectory", () => {
  it("searches contacts by role and exposes a clear empty state", () => {
    render(<ContactsDirectory contacts={v2DemoSnapshot.contacts} />);
    const searchbox = screen.getByRole("searchbox", { name: "Buscar contactos" });

    fireEvent.change(searchbox, { target: { value: "asuntos corporativos" } });
    expect(screen.getByText("Mart\u00edn Silva")).toBeVisible();

    fireEvent.change(searchbox, { target: { value: "sin coincidencias" } });
    expect(screen.getByText("No encontramos contactos")).toBeVisible();
  });
});
