-- DropIndex
DROP INDEX "Coa_lotNumber_key";

-- AlterTable
ALTER TABLE "Coa" ADD COLUMN     "documentTitle" TEXT,
ADD COLUMN     "mfgDate" TIMESTAMP(3),
ADD COLUMN     "retestDate" TIMESTAMP(3),
ADD COLUMN     "pages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "Coa_productId_lotNumber_key" ON "Coa"("productId", "lotNumber");

