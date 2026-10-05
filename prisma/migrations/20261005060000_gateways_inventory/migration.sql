ALTER TABLE "Plan" ADD COLUMN "description" TEXT NOT NULL DEFAULT 'Residential IP addresses suitable for remote jobs, bot work, and trading.', ADD COLUMN "countryCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "checkoutStarted" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "transactionId" TEXT;
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");
UPDATE "PaymentMethod" SET "enabled"=false WHERE "provider" IN ('stripe','crypto');
INSERT INTO "PaymentMethod" (id,label,provider,instructions,enabled) VALUES
('flutterwave','Flutterwave','flutterwave','',false),('nowpayments','Cryptocurrency','nowpayments','',false) ON CONFLICT (id) DO NOTHING;
UPDATE "Plan" SET "countryCode" = CASE WHEN "region" = 'US' THEN 'US' WHEN "location" = 'Frankfurt' THEN 'DE' WHEN "location" = 'Singapore' THEN 'SG' ELSE NULL END;
