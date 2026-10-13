-- Partner payouts are bank transfers only.
UPDATE "Affiliate" SET "payoutMethod" = 'BANK' WHERE "payoutMethod" <> 'BANK';
UPDATE "Payout" SET "method" = 'BANK' WHERE "status" = 'REQUESTED';
