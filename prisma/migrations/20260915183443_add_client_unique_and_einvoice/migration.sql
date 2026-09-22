/*
  Warnings:

  - A unique constraint covering the columns `[restaurantId,phone]` on the table `Client` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[restaurantId,documentId]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "eInvoiceEnabled" BOOLEAN DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Client_restaurantId_phone_key" ON "Client"("restaurantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Client_restaurantId_documentId_key" ON "Client"("restaurantId", "documentId");
