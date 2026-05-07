"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { shouldReplaceDomCollection } from "@/lib/dom/chat-state";
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
  const [currentThreadId, setCurrentThreadId] = useState(threadId);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const latestMessageId = messages.at(-1)?.id ?? "";

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
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTo({
      behavior: "smooth",
      top: container.scrollHeight,
    });
  }, [latestMessageId, messages.length]);

  useEffect(() => {
    if (!currentThreadId) return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/dom/chat?scope=${encodeURIComponent(scope)}`);
      const data = await response.json().catch(() => null);
      if (data?.ok) {
        const nextMessages = data.messages ?? [];
        const nextTasks = data.tasks ?? [];
        setMessages((current) =>
          shouldReplaceDomCollection(current, nextMessages)
            ? nextMessages
            : current,
        );
        setTasks((current) =>
          shouldReplaceDomCollection(current, nextTasks) ? nextTasks : current,
        );
        if (data.thread?.id) setCurrentThreadId(data.thread.id);
      }
    }, 8000);

    return () => window.clearInterval(interval);
  }, [scope, currentThreadId]);

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
        threadId: currentThreadId ?? "",
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
        body: JSON.stringify({ message, scope, threadId: currentThreadId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "No se pudo hablar con Dom.");
      }

      setMessages(data.messages ?? []);
      setTasks(data.tasks ?? []);
      if (data.threadId) setCurrentThreadId(data.threadId);
      if (data.agentEvent?.ok === false) {
        setError("Mensaje guardado, pero no se pudo avisar a Dom. Revisa el inbox de eventos.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error enviando mensaje.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="sticky top-6 flex h-[min(42rem,calc(100dvh-8rem))] min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Bot className="size-4" />
          Chat con Dom
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{campaignName}</div>
        <div className="mt-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          {activityLabel}
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 scroll-smooth"
      >
        {messages.length ? (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex min-w-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
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
                  "max-w-[82%] min-w-0 rounded-lg px-3 py-2 text-sm leading-relaxed shadow-[0_1px_0_rgba(15,23,42,0.04)]",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : message.role === "system"
                      ? "border border-border bg-background text-muted-foreground"
                      : "bg-muted text-foreground",
                )}
              >
                <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {message.content}
                </div>
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
      </div>

      <div className="shrink-0 border-t border-border bg-card/95 p-4">
        {error ? (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Textarea
            className="h-20 min-h-0 resize-none [field-sizing:fixed]"
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
            className="h-20 shrink-0 transition-transform hover:-translate-y-0.5 active:translate-y-px"
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
