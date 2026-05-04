import { Mail } from "lucide-react";

import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Mail className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Acceso privado</h1>
            <p className="text-sm text-muted-foreground">
              Prospección de auspicios
            </p>
          </div>
        </div>
        <LoginForm />
        <p className="mt-4 text-xs text-muted-foreground">
          En modo demo, entra directo desde `/campaigns`.
        </p>
      </section>
    </main>
  );
}
