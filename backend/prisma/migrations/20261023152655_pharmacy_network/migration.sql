-- CreateEnum
CREATE TYPE "PartnerKind" AS ENUM ('PHARMACY', 'HOSPITAL', 'LOGISTICS');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'CONTACTED', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'OFFERED', 'ACCEPTED', 'IN_TRANSIT', 'RECEIVED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('SCHEDULED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('PREMISES_LICENCE', 'SUPERINTENDENT_LICENCE', 'CAC_CERTIFICATE', 'COLD_CHAIN_CALIBRATION', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "payoutId" TEXT;

-- AlterTable
ALTER TABLE "Pharmacy" ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "bankVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "bankVerifiedById" TEXT,
ADD COLUMN     "coverageAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "email" TEXT,
ADD COLUMN     "lastOrderAt" TEXT,
ADD COLUMN     "licenceReminderDays" INTEGER,
ADD COLUMN     "openDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "opensAt" TEXT,
ADD COLUMN     "superintendentName" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationsSeenAt" TIMESTAMP(3),
ADD COLUMN     "pcnRegNo" TEXT;

-- CreateTable
CREATE TABLE "PartnerApplication" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "PartnerKind" NOT NULL,
    "organisation" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "pharmacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fromPharmacyId" TEXT NOT NULL,
    "toPharmacyId" TEXT,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "dispatchedById" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedBatchId" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "grossKobo" INTEGER NOT NULL,
    "feesKobo" INTEGER NOT NULL,
    "netKobo" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'SCHEDULED',
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "reference" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reminderDays" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerApplication_code_key" ON "PartnerApplication"("code");

-- CreateIndex
CREATE INDEX "PartnerApplication_status_createdAt_idx" ON "PartnerApplication"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_code_key" ON "Transfer"("code");

-- CreateIndex
CREATE INDEX "Transfer_fromPharmacyId_status_idx" ON "Transfer"("fromPharmacyId", "status");

-- CreateIndex
CREATE INDEX "Transfer_toPharmacyId_status_idx" ON "Transfer"("toPharmacyId", "status");

-- CreateIndex
CREATE INDEX "Transfer_status_idx" ON "Transfer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_code_key" ON "Payout"("code");

-- CreateIndex
CREATE INDEX "Payout_pharmacyId_createdAt_idx" ON "Payout"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE INDEX "ComplianceDocument_pharmacyId_kind_createdAt_idx" ON "ComplianceDocument"("pharmacyId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceDocument_status_idx" ON "ComplianceDocument"("status");

-- CreateIndex
CREATE INDEX "Order_payoutId_idx" ON "Order"("payoutId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromPharmacyId_fkey" FOREIGN KEY ("fromPharmacyId") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toPharmacyId_fkey" FOREIGN KEY ("toPharmacyId") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
