"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import {
  updateReplyDraftAction,
  type ActionState,
} from "@/features/prospecting/actions";
import type {
  AppReply,
  AppCompany,
  AppContact,
  AppSender,
} from "@/lib/prospecting/demo-data";

type ReviewReply = AppReply & {
  localStatus: AppReply["approvalStatus"];
  localDraft: string;
};

const initialActionState: ActionState = { ok: false, message: "" };

export function RepliesReview({
  companies,
  contacts,
  replies,
  senders,
}: {
  companies: AppCompany[];
  contacts: AppContact[];
  replies: AppReply[];
  senders: AppSender[];
}) {
  const router = useRouter();
  const [actionState, formAction, isPending] = useActionState(
    updateReplyDraftAction,
    initialActionState,
  );
  const [items, setItems] = useState<ReviewReply[]>(
    replies.map((reply) => ({
      ...reply,
      localStatus: reply.approvalStatus,
      localDraft: reply.draftResponse,
    })),
  );

  useEffect(() => {
    if (actionState.message) {
      router.refresh();
    }
  }, [actionState, router]);

  function updateStatus(id: string, status: AppReply["approvalStatus"]) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, localStatus: status } : item,
      ),
    );
  }

  function updateDraft(id: string, draft: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, localDraft: draft } : item,
      ),
    );
  }

  return (
    <div className="space-y-4">
      {actionState.message ? <ActionMessage state={actionState} /> : null}
      {items.map((reply) => {
        const company = companies.find((item) => item.id === reply.companyId);
        const contact = contacts.find((item) => item.id === reply.contactId);
        const sender = senders.find((item) => item.id === reply.senderId);

        return (
          <form
            action={formAction}
            key={reply.id}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <input type="hidden" name="replyId" value={reply.id} />
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{company?.name}</h2>
                  <StatusBadge status={reply.localStatus} />
                  <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700">
                    {reply.classification}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {contact?.name} · responder desde {sender?.email}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={isPending}
                  name="intent"
                  type="submit"
                  variant="outline"
                  value="rejected"
                  size="sm"
                  onClick={() => updateStatus(reply.id, "rejected")}
                >
                  <X className="size-4" />
                  Rechazar
                </Button>
                <Button
                  disabled={isPending}
                  name="intent"
                  type="submit"
                  value="approved"
                  size="sm"
                  onClick={() => updateStatus(reply.id, "approved")}
                >
                  <Check className="size-4" />
                  Aprobar
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Reply recibido
                </div>
                <p className="whitespace-pre-wrap text-sm">{reply.body}</p>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Draft respuesta
                </div>
                <Textarea
                  className="min-h-44 font-mono text-sm"
                  name="draft"
                  value={reply.localDraft}
                  onChange={(event) => updateDraft(reply.id, event.target.value)}
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    disabled={isPending}
                    name="intent"
                    size="sm"
                    type="submit"
                    value="save"
                    variant="outline"
                  >
                    <Save className="size-4" />
                    Guardar draft
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Nota futura: {reply.futureNote}
            </div>
          </form>
        );
      })}
    </div>
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  return (
    <div
      className={
        state.ok
          ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          : "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
      }
    >
      {state.message}
    </div>
  );
}
