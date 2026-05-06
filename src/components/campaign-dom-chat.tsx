"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { DomChatMessage, DomTask } from "@/lib/dom/types";
import { cn } from "@/lib/utils";

export function CampaignDomChat({
  campaignName,
  initialMessages,
  initialTasks,
  scope,
  threadId,
}: {
  campaignName: string;
  initialMessages: DomChatMessage[];
  initialTasks: DomTask[];
  scope: string;
  threadId: string | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [tasks, setTasks] = useState(initialTasks);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const activityLabel = useMemo(() => {
    const activeTask = tasks.find((task) => task.status === "in_progress");
    if (activeTask) return `Dom está trabajando: ${activeTask.description}`;
    const latestDomMessage = [...messages]
      .reverse()
      .find((message) => message.role === "dom");
    if (latestDomMessage) return `Dom respondió ${formatRelative(latestDomMessage.createdAt)}`;
    return "Sin respuesta de Dom todavía";
  }, [messages, tasks]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!threadId) return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/dom/chat?scope=${encodeURIComponent(scope)}`);
      const data = await response.json().catch(() => null);
      if (data?.ok) {
        setMessages(data.messages ?? []);
        setTasks(data.tasks ?? []);
      }
    }, 8000);

    return () => window.clearInterval(interval);
  }, [scope, threadId]);

  async function sendMessage() {
    const message = input.trim();
    if (!message || isSending) return;

    setInput("");
    setError("");
    setIsSending(true);
    setMessages((current) => [
      ...current,
      {
        id: `optimistic-${Date.now()}`,
        threadId: threadId ?? "",
        role: "user",
        content: message,
        metadata: { optimistic: true },
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch("/api/dom/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, scope, threadId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo hablar con Dom.");
      }

      setMessages(data.messages ?? []);
      setTasks(data.tasks ?? []);
      if (data.dom?.skipped) {
        setError("Mensaje guardado. Falta configurar DOM_API_TOKEN para que Dom lo procese.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error enviando mensaje.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="flex min-h-[42rem] flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Bot className="size-4" />
          Chat con Dom
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{campaignName}</div>
        <div className="mt-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {activityLabel}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length ? (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-2",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {message.role !== "user" ? (
                <BubbleIcon>
                  <Bot className="size-4" />
                </BubbleIcon>
              ) : null}
              <div
                className={cn(
                  "max-w-[82%] rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : message.role === "system"
                      ? "border border-border bg-background text-muted-foreground"
                      : "bg-muted text-foreground",
                )}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                <div
                  className={cn(
                    "mt-1 text-[11px]",
                    message.role === "user"
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground",
                  )}
                >
                  {formatRelative(message.createdAt)}
                </div>
              </div>
              {message.role === "user" ? (
                <BubbleIcon>
                  <User className="size-4" />
                </BubbleIcon>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Todavía no hay mensajes en esta campaña.
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-4">
        {error ? (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Textarea
            className="min-h-20 resize-none"
            disabled={isSending}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Pedile algo a Dom para esta campaña..."
            value={input}
          />
          <Button
            className="shrink-0"
            disabled={!input.trim() || isSending}
            onClick={() => void sendMessage()}
            type="button"
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}

function BubbleIcon({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
      {children}
    </div>
  );
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sin fecha";

  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
