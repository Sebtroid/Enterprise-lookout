# Estado del Build - 2026-05-06

## Lo que ya está hecho

### 1. Chat Panel ✅
- Schema: `supabase/chat_schema.sql` (tablas `chat_conversations`, `chat_messages`)
- Componente: `src/components/chat-panel.tsx`
- API: `src/app/api/chat/route.ts`
- Integrado en layout del dashboard

### 2. Redrafting Animation ✅
- En `src/components/outbound-review.tsx`
- Cuando se rechaza con "bad_copy", muestra animación de "Redactando..." con spinner
- Cuando termina, aparece el nuevo mail arriba con badge "Nuevo borrador"

### 3. Gmail OAuth + Send API ✅
- `src/app/api/gmail/route.ts` — genera URL de OAuth
- `src/app/api/gmail/callback/route.ts` — recibe token y lo guarda en DB
- `src/app/api/gmail/send/route.ts` — envía mails usando Gmail API
- `src/app/(dashboard)/settings/gmail/page.tsx` — página de settings
- Enlace en sidebar: `src/components/app-sidebar.tsx`
- OutboundReview detecta si remitente tiene Gmail conectado y muestra "Enviar con Gmail"

### 4. Commit ✅
- Push a GitHub hecho

## Lo que falta

1. **Vercel Token** — necesito `VERCEL_TOKEN` para hacer deploy automático
2. **Gmail OAuth Credentials** — necesito `GMAIL_CLIENT_ID` y `GMAIL_CLIENT_SECRET`
   - Crear en https://console.cloud.google.com
   - Habilitar Gmail API
   - Agregar redirect URI: `https://enterprise-lookout.vercel.app/api/gmail/callback`
3. **Deploy a Vercel** — una vez tengo el token
4. **Variables de entorno en Vercel** — `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`
5. **Aplicar schema de chat en Supabase** — ejecutar `supabase/chat_schema.sql`

## Próximos pasos después de tener los accesos

- Deployar la app a Vercel
- Setear env vars en Vercel
- Conectar Gmail (Sebastián hace OAuth una vez)
- Probar envío real de mails
- Probar chat panel
