-- CreateTable
CREATE TABLE "pkce_entries" (
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pkce_entries_pkey" PRIMARY KEY ("state")
);

-- CreateIndex
CREATE INDEX "pkce_entries_expiresAt_idx" ON "pkce_entries"("expiresAt");
