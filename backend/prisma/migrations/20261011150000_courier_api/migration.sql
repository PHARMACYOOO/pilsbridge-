-- AlterTable
ALTER TABLE "Courier" ADD COLUMN     "api" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "bookingError" TEXT,
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "providerStatusAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "dropoffLat" DOUBLE PRECISION,
ADD COLUMN     "dropoffLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Pharmacy" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "DeliveryQuote" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "courierId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "courierFeeKobo" INTEGER,
    "priceKobo" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryQuote_createdAt_idx" ON "DeliveryQuote"("createdAt");

