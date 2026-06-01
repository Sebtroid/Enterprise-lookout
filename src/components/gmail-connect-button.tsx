"use client";

import { type ComponentProps, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";

export function GmailConnectButton({
  label = "Conectar Gmail",
  loadingLabel = "Cargando...",
  size = "lg",
}: {
  label?: string;
  loadingLabel?: string;
  size?: ComponentProps<typeof Button>["size"];
}) {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/gmail?action=url");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Error generando URL de autorización");
      }
    } catch {
      alert("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleConnect} disabled={loading} size={size}>
      {loading ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <Mail className="mr-2 size-4" />
      )}
      {loading ? loadingLabel : label}
    </Button>
  );
}
