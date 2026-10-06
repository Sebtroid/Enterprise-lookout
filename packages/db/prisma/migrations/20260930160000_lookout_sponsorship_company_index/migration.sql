-- A company can participate in several events, so company detail queries need this lookup.
CREATE INDEX "lookout_sponsorship_companyId_idx" ON "lookout_sponsorship"("companyId");
