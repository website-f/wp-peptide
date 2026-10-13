-- CreateTable
CREATE TABLE "PaymentBill" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "billCode" TEXT NOT NULL,
    "env" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBill_billCode_key" ON "PaymentBill"("billCode");

-- CreateIndex
CREATE INDEX "PaymentBill_orderId_createdAt_idx" ON "PaymentBill"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentBill" ADD CONSTRAINT "PaymentBill_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: the bill each existing order already points at. The host in its payment URL
-- tells which ToyyibPay it was issued on.
INSERT INTO "PaymentBill" ("id", "orderId", "billCode", "env", "amountCents", "paymentUrl", "createdAt")
SELECT 'bf' || md5(o."id" || o."billCode"), o."id", o."billCode",
       CASE WHEN o."paymentUrl" LIKE 'https://dev.toyyibpay.com/%' OR o."paymentUrl" IS NULL THEN 'sandbox' ELSE 'production' END,
       o."totalCents", COALESCE(o."paymentUrl", ''), o."createdAt"
FROM "Order" o
WHERE o."billCode" IS NOT NULL
ON CONFLICT ("billCode") DO NOTHING;
