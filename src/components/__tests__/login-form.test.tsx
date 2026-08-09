import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginForm } from "@/components/login-form";

describe("LoginForm", () => {
  it("offers Google and magic-link authentication", () => {
    render(<LoginForm />);

    expect(
      screen.getByRole("button", { name: "Continuar con Google" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enviar enlace de acceso" }),
    ).toBeInTheDocument();
  });
});
