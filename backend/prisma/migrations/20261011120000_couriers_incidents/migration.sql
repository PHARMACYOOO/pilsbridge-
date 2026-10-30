-- CreateEnum
CREATE TYPE "DeliveryProvider" AS ENUM ('PILBRIDGE_RIDERS', 'COURIER');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('DAMAGED', 'TAMPERED', 'LOST', 'TEMPERATURE_EXCURSION', 'WRONG_ITEM', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "courierId" TEXT,
ADD COLUMN     "feeKobo" INTEGER,
ADD COLUMN     "handedOverById" TEXT,
ADD COLUMN     "proof" TEXT,
ADD COLUMN     "provider" "DeliveryProvider" NOT NULL DEFAULT 'PILBRIDGE_RIDERS',
ADD COLUMN     "providerRef" TEXT,
ADD COLUMN     "trackingUrl" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "deliveryAllowed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Courier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "acceptsPrescription" BOOLEAN NOT NULL DEFAULT false,
    "acceptsColdChain" BOOLEAN NOT NULL DEFAULT false,
    "approvalNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Courier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "type" "IncidentType" NOT NULL,
    "description" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reporterRole" "Role" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Courier_name_key" ON "Courier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_code_key" ON "Incident"("code");

-- CreateIndex
CREATE INDEX "Incident_status_createdAt_idx" ON "Incident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_orderId_idx" ON "Incident"("orderId");

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

