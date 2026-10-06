-- Applied to the existing Enterprise-Lookout project on 2026-10-01.
-- The table belongs only to the private V2 schema.
CREATE TABLE lookout_v2."lookout_invite" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lookout_invite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lookout_invite_email_key" ON lookout_v2."lookout_invite"("email");
CREATE UNIQUE INDEX "lookout_invite_tokenHash_key" ON lookout_v2."lookout_invite"("tokenHash");
CREATE INDEX "lookout_invite_expiresAt_idx" ON lookout_v2."lookout_invite"("expiresAt");

GRANT SELECT, INSERT, UPDATE, DELETE ON lookout_v2."lookout_invite" TO lookout_v2_app;
