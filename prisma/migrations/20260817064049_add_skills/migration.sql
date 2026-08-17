-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "targetTracks" TEXT[],
    "levels" TEXT[],
    "assessmentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skills_organizationId_idx" ON "skills"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "skills_organizationId_key_key" ON "skills"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
