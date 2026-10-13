-- AlterEnum
ALTER TYPE "CouponType" ADD VALUE 'FREE_SHIPPING';

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxDiscountCents" INTEGER,
ADD COLUMN     "maxUsesPerCustomer" INTEGER,
ADD COLUMN     "modes" TEXT[] DEFAULT ARRAY['standard']::TEXT[],
ADD COLUMN     "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "stackWithTiers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCounted" BOOLEAN NOT NULL DEFAULT false;
