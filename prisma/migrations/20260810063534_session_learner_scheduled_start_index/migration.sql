-- CreateIndex
CREATE INDEX "sessions_learnerId_scheduledStart_idx" ON "sessions"("learnerId", "scheduledStart");
