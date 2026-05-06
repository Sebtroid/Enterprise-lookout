"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MessageSquare, X, Send, Bot, User, Loader2 } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "action";
  content: string;
  status?: "pending" | "streaming" | "completed" | "error";
  actionType?: string;
}

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hola. Soy Dom, tu asistente de prospección.\n\nPuedo:\n• Buscar empresas para una campaña\n• Redactar mails de outreach\n• Revisar y responder correos\n• Investigar contactos\n\n¿Qué necesitas?",
      status: "completed",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const scope = getScopeFromPath(pathname);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      status: "completed",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Add placeholder assistant message with streaming status
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        status: "streaming",
      },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          scope,
          history: messages
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: data.content || data.message || "No recibí respuesta.",
                status: "completed",
                actionType: data.actionType,
              }
            : m
        )
      );

      // If action was taken, refresh the page data
      if (data.actionTaken) {
        window.location.reload();
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: "Error al procesar tu solicitud. Intenta de nuevo.",
                status: "error",
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-lg transition-all",
          isOpen && "bg-destructive hover:bg-destructive/90"
        )}
      >
        {isOpen ? <X className="size-6" /> : <MessageSquare className="size-6" />}
      </Button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[600px] w-[400px] flex-col rounded-xl border bg-background shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="size-4" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Dom</div>
              <div className="text-xs text-muted-foreground">
                {isLoading ? "Escribiendo..." : "En línea"}
              </div>
            </div>
            {scope && scope !== "all" && (
              <div className="rounded-md bg-muted px-2 py-1 text-xs">
                {scope}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    message.role === "user"
                      ? "bg-muted"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  {message.role === "user" ? (
                    <User className="size-4" />
                  ) : (
                    <Bot className="size-4" />
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm max-w-[85%]",
                    message.role === "user"
                      ? "bg-muted"
                      : "bg-primary/10 text-foreground"
                  )}
                >
                  {message.status === "streaming" ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      <span>Pensando...</span>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pídeme algo..."
                className="min-h-[60px] resize-none"
                disabled={isLoading}
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="shrink-0"
              >
                <Send className="size-4" />
              </Button>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Shift + Enter para nueva línea
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getScopeFromPath(pathname: string) {
  const [first, second] = pathname.split("/").filter(Boolean);
  if (first === "campaigns" && second) return second;
  return "all";
}
