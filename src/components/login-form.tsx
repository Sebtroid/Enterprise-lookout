"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setStatus("El acceso privado todavía no está configurado.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/today`,
      },
    });

    setStatus(error ? error.message : "Enlace enviado. Revisa tu correo.");
  }

  async function continueWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("El acceso privado todavía no está configurado.");
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/today`,
      },
    });
    if (error) setStatus(error.message);
  }

  return (
    <div className="space-y-4">
      <Button
        className="w-full"
        type="button"
        variant="outline"
        onClick={continueWithGoogle}
      >
        Continuar con Google
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        o usa tu correo
        <span className="h-px flex-1 bg-border" />
      </div>
      <form className="space-y-3" onSubmit={submit}>
        <label className="grid gap-1.5 text-sm font-medium">
          Correo autorizado
          <Input
            type="email"
            placeholder="nombre@universidad.cl"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <Button className="w-full" type="submit">
          Enviar enlace de acceso
        </Button>
      </form>
      {status ? (
        <p className="text-xs text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
