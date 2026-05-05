import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Check, AlertTriangle, ExternalLink } from "lucide-react";
import { getPostgresClient } from "@/lib/supabase/postgres";

export const dynamic = "force-dynamic";

export default async function GmailSettingsPage() {
  const sql = getPostgresClient();
  let tokens: { user_email: string; updated_at: string }[] = [];

  if (sql) {
    tokens = await sql`
      select user_email, updated_at::text
      from gmail_tokens
      order by updated_at desc
    `;
  }

  const getAuthUrl = async () => {
    "use server";
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ""}/api/gmail?action=url`);
    const data = await res.json();
    return data.url;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Gmail</h1>
        <p className="text-sm text-muted-foreground">
          Conecta tu cuenta de Gmail para enviar mails directamente desde Dom.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Estado de conexión
          </CardTitle>
          <CardDescription>
            {tokens.length > 0
              ? `${tokens.length} cuenta(s) conectada(s)`
              : "Ninguna cuenta conectada"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokens.length > 0 ? (
            <div className="space-y-3">
              {tokens.map((token) => (
                <div
                  key={token.user_email}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Check className="size-4 text-emerald-500" />
                    <div>
                      <div className="font-medium">{token.user_email}</div>
                      <div className="text-xs text-muted-foreground">
                        Conectado el {new Date(token.updated_at).toLocaleDateString("es-CL")}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">Activo</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6">
              <AlertTriangle className="size-8 text-amber-500" />
              <div className="text-center">
                <div className="font-medium">No hay cuentas conectadas</div>
                <div className="text-sm text-muted-foreground">
                  Conecta Gmail para que Dom pueda enviar mails como tú.
                </div>
              </div>
              <GmailConnectButton />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>¿Cómo funciona?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            1. Conectas tu Gmail con OAuth (seguro, no guardamos tu contraseña).
          </p>
          <p>
            2. Cuando apruebes un mail en "Mails", Dom puede enviarlo directamente
            en vez de abrir Outlook Web.
          </p>
          <p>
            3. Los replies se monitorean automáticamente y aparecen en "Respuestas".
          </p>
          <p>
            4. Puedes revocar el acceso en cualquier momento desde{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Google Account Settings
              <ExternalLink className="size-3" />
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function GmailConnectButton() {
  return (
    <form
      action={async () => {
        "use server";
        const url = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/gmail?action=url`
        ).then((r) => r.json());
        if (url.url) {
          // Server can't redirect to external URLs directly, use client redirect
          return url.url;
        }
      }}
    >
      <Button type="submit" size="lg">
        <Mail className="mr-2 size-4" />
        Conectar Gmail
      </Button>
    </form>
  );
}
