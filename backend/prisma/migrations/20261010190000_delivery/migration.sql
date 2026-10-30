-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('AWAITING_RIDER', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'RIDER';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryArea" TEXT,
ADD COLUMN     "etaMinutes" INTEGER;

-- AlterTable
ALTER TABLE "Pharmacy" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "RiderProfile" (
    "userId" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "coldChain" BOOLEAN NOT NULL DEFAULT false,
    "area" TEXT,
    "onlineSince" TIMESTAMP(3),

    CONSTRAINT "RiderProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "riderId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'AWAITING_RIDER',
    "coldChain" BOOLEAN NOT NULL DEFAULT false,
    "dropoffCode" TEXT NOT NULL,
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failReason" TEXT,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_code_key" ON "Delivery"("code");

-- CreateIndex
CREATE INDEX "Delivery_status_idx" ON "Delivery"("status");

-- CreateIndex
CREATE INDEX "Delivery_riderId_status_idx" ON "Delivery"("riderId", "status");

-- CreateIndex
CREATE INDEX "Delivery_orderId_idx" ON "Delivery"("orderId");

-- AddForeignKey
ALTER TABLE "RiderProfile" ADD CONSTRAINT "RiderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

