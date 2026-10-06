-- AlterTable
ALTER TABLE "company" ADD COLUMN     "sponsorshipProfile" JSONB;

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "sponsorshipProfile" JSONB;

-- CreateTable
CREATE TABLE "lookout_work_area" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookout_work_area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookout_event" (
    "id" TEXT NOT NULL,
    "workAreaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3),
    "location" TEXT,
    "audience" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "cashTarget" INTEGER NOT NULL DEFAULT 0,
    "needs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookout_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookout_sponsorship" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'candidate',
    "fitScore" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "nextFollowupAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "selectedContactReason" TEXT,
    "futureNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookout_sponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookout_contribution" (
    "id" TEXT NOT NULL,
    "sponsorshipId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'unidades',
    "estimatedValue" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookout_contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookout_budget_line" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "planned" INTEGER NOT NULL DEFAULT 0,
    "actual" INTEGER NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookout_budget_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookout_benefit" (
    "id" TEXT NOT NULL,
    "sponsorshipId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lookout_benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookout_draft" (
    "id" TEXT NOT NULL,
    "sponsorshipId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'needs_review',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookout_draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lookout_work_area_ownerId_idx" ON "lookout_work_area"("ownerId");

-- CreateIndex
CREATE INDEX "lookout_event_workAreaId_idx" ON "lookout_event"("workAreaId");

-- CreateIndex
CREATE INDEX "lookout_sponsorship_contactId_idx" ON "lookout_sponsorship"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "lookout_sponsorship_eventId_companyId_key" ON "lookout_sponsorship"("eventId", "companyId");

-- CreateIndex
CREATE INDEX "lookout_contribution_sponsorshipId_idx" ON "lookout_contribution"("sponsorshipId");

-- CreateIndex
CREATE INDEX "lookout_budget_line_eventId_idx" ON "lookout_budget_line"("eventId");

-- CreateIndex
CREATE INDEX "lookout_benefit_sponsorshipId_idx" ON "lookout_benefit"("sponsorshipId");

-- CreateIndex
CREATE INDEX "lookout_draft_sponsorshipId_idx" ON "lookout_draft"("sponsorshipId");

-- AddForeignKey
ALTER TABLE "lookout_work_area" ADD CONSTRAINT "lookout_work_area_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookout_event" ADD CONSTRAINT "lookout_event_workAreaId_fkey" FOREIGN KEY ("workAreaId") REFERENCES "lookout_work_area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookout_sponsorship" ADD CONSTRAINT "lookout_sponsorship_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "lookout_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookout_sponsorship" ADD CONSTRAINT "lookout_sponsorship_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookout_sponsorship" ADD CONSTRAINT "lookout_sponsorship_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookout_contribution" ADD CONSTRAINT "lookout_contribution_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "lookout_sponsorship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookout_budget_line" ADD CONSTRAINT "lookout_budget_line_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "lookout_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookout_benefit" ADD CONSTRAINT "lookout_benefit_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "lookout_sponsorship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lookout_draft" ADD CONSTRAINT "lookout_draft_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "lookout_sponsorship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
