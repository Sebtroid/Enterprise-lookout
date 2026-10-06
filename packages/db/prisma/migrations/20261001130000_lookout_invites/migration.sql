-- CreateTable
CREATE TABLE "lookout_invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lookout_invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lookout_invite_email_key" ON "lookout_invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "lookout_invite_tokenHash_key" ON "lookout_invite"("tokenHash");

-- CreateIndex
CREATE INDEX "lookout_invite_expiresAt_idx" ON "lookout_invite"("expiresAt");
