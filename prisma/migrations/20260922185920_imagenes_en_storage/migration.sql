/*
  Warnings:

  - You are about to drop the column `heroImageBase64` on the `Restaurant` table. All the data in the column will be lost.
  - You are about to drop the column `logoBase64` on the `Restaurant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" DROP COLUMN "heroImageBase64",
DROP COLUMN "logoBase64",
ADD COLUMN     "heroImageUrl" TEXT,
ADD COLUMN     "logoUrl" TEXT;
