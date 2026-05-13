"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type GmailSyncSummary = {
  gmailMessagesScanned?: number;
  inserted?: number;
  scanned?: number;
  sentMessagesChecked?: number;
};

export function formatGmailSyncSummary(data: GmailSyncSummary) {
  const sentMessagesChecked = data.sentMessagesChecked ?? 0;
  const gmailMessagesScanned = data.gmailMessagesScanned ?? data.scanned ?? 0;
  const inserted = data.inserted ?? 0;

  return [
    `Mails enviados revisados: ${sentMessagesChecked}.`,
    `Mensajes candidatos encontrados en Gmail: ${gmailMessagesScanned}.`,
    `Respuestas nuevas: ${inserted}.`,
  ].join(" ");
}

export function GmailSyncRepliesButton({ scope }: { scope: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function syncReplies() {
    setLoading(true);
    try {
      const response = await fetch("/api/gmail/sync-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, days: 90, limit: 80 }),
      });
      const data = await response.json();

      if (!data.ok) {
        alert(data.error ?? "No pude sincronizar Gmail.");
        return;
      }

      alert(formatGmailSyncSummary(data));
      router.refresh();
    } catch {
      alert("Error de red al sincronizar Gmail.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button disabled={loading} onClick={syncReplies} type="button" variant="outline">
      <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
      {loading ? "Sincronizando" : "Sincronizar Gmail"}
    </Button>
  );
}
