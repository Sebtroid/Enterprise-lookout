ALTER TABLE lookout_v2.lookout_draft
  ADD COLUMN "approvalHash" TEXT,
  ADD COLUMN "recipientEmail" TEXT,
  ADD COLUMN "senderEmail" TEXT,
  ADD COLUMN "sendingStartedAt" TIMESTAMP(3),
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "gmailMessageId" TEXT,
  ADD COLUMN "gmailThreadId" TEXT,
  ADD COLUMN "sendError" TEXT;

CREATE TABLE lookout_v2.lookout_mailbox (
  "userId" TEXT PRIMARY KEY REFERENCES lookout_v2."user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX lookout_mailbox_email_key ON lookout_v2.lookout_mailbox(email);
ALTER TABLE lookout_v2.lookout_mailbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY lookout_mailbox_private_app ON lookout_v2.lookout_mailbox FOR ALL TO lookout_v2_app USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE lookout_v2.lookout_mailbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lookout_v2.lookout_mailbox TO lookout_v2_app;
