-- CreateEnum
CREATE TYPE "FailureCause" AS ENUM ('CUSTOMER_UNAVAILABLE', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED', 'PHARMACY_DELAY', 'COURIER_FAULT', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "CostBearer" AS ENUM ('CUSTOMER', 'COURIER', 'PHARMACY', 'PLATFORM');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'RECONCILED');

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "costBearer" "CostBearer",
ADD COLUMN     "failureCause" "FailureCause";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "preparingAt" TIMESTAMP(3),
ADD COLUMN     "readyAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CourierInvoice" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalKobo" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" TIMESTAMP(3),
    "reconciledById" TEXT,

    CONSTRAINT "CourierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,

    CONSTRAINT "CourierInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourierInvoice_courierId_number_key" ON "CourierInvoice"("courierId", "number");

-- CreateIndex
CREATE INDEX "CourierInvoiceLine_invoiceId_idx" ON "CourierInvoiceLine"("invoiceId");

-- AddForeignKey
ALTER TABLE "CourierInvoice" ADD CONSTRAINT "CourierInvoice_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierInvoiceLine" ADD CONSTRAINT "CourierInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CourierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

