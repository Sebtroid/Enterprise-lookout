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
      setStatus("Modo demo activo. Abre /campaigns.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/campaigns`,
      },
    });

    setStatus(error ? error.message : "Link enviado.");
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Input
        type="email"
        placeholder="correo autorizado"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <Button className="w-full" type="submit">
        Enviar link
      </Button>
      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
    </form>
  );
}
