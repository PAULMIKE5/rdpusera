ALTER TABLE "Payment" ADD COLUMN "chargeCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "chargeAmount" DECIMAL(18,2),
  ADD COLUMN "exchangeRate" DECIMAL(18,6),
  ADD COLUMN "paymentMethodId" TEXT;
ALTER TABLE "PaymentMethod" ADD COLUMN "usdToNgn" DECIMAL(18,6);
-- Keep existing USD payments and references unchanged. New NGN collections require an explicit rate.
UPDATE "PaymentMethod" SET "label" = 'USD cards · Flutterwave' WHERE "provider" = 'flutterwave';
INSERT INTO "PaymentMethod" ("id", "label", "provider", "instructions", "enabled")
SELECT 'flutterwave-ngn', 'Naira · Bank transfer, card & USSD', 'flutterwave_ngn', '', false
WHERE NOT EXISTS (SELECT 1 FROM "PaymentMethod" WHERE "provider" = 'flutterwave_ngn')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "PaymentMethod" ("id", "label", "provider", "instructions", "enabled")
SELECT 'flutterwave-usd', 'USD cards · Flutterwave', 'flutterwave', '', false
WHERE NOT EXISTS (SELECT 1 FROM "PaymentMethod" WHERE "provider" = 'flutterwave')
ON CONFLICT ("id") DO NOTHING;
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_usdToNgn_range"
  CHECK ("usdToNgn" IS NULL OR ("usdToNgn" > 0 AND "usdToNgn" <= 100000));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ngn_quote"
  CHECK ("provider" <> 'flutterwave_ngn' OR ("chargeCurrency" = 'NGN' AND "chargeAmount" IS NOT NULL AND "chargeAmount" > 0 AND "exchangeRate" IS NOT NULL AND "exchangeRate" > 0));
