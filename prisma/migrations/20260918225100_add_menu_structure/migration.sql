-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "density" TEXT DEFAULT 'normal',
ADD COLUMN     "imageShape" TEXT DEFAULT 'rounded',
ADD COLUMN     "itemLayout" TEXT DEFAULT 'card',
ADD COLUMN     "nameStyle" TEXT DEFAULT 'normal',
ADD COLUMN     "priceStyle" TEXT DEFAULT 'accent';
