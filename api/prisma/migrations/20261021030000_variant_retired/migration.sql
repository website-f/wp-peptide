-- Sizes removed in the admin that have orders are kept for order history, hidden everywhere else.
ALTER TABLE "Variant" ADD COLUMN "retiredAt" TIMESTAMP(3);

-- Sizes already retired the old way (SKU renamed, switched off).
UPDATE "Variant" SET "retiredAt" = CURRENT_TIMESTAMP WHERE "sku" LIKE '%-RETIRED-%' AND "active" = false;
