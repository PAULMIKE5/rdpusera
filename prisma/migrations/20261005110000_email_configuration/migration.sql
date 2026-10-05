ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3), ADD COLUMN "emailVerificationRequired" BOOLEAN NOT NULL DEFAULT true;
-- Existing accounts retain access; they are not falsely marked email-verified.
UPDATE "User" SET "emailVerificationRequired"=false;
CREATE TABLE "EmailVerification" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE,
 "codeHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0, "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "EmailVerification_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5)
);
CREATE INDEX "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt");
ALTER TABLE "OrderItem" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "Instance" ADD COLUMN "countryCode" TEXT, ADD COLUMN "os" TEXT, ADD COLUMN "location" TEXT;
ALTER TABLE "InventoryServer" ADD COLUMN "countryCode" TEXT, ADD COLUMN "os" TEXT;
UPDATE "OrderItem" o SET "countryCode"=p."countryCode" FROM "Plan" p WHERE p.id=o."planId";
UPDATE "Instance" i SET "countryCode"=p."countryCode", "os"=p.os,"location"=p.location FROM "Plan" p WHERE p.id=i."planId";
UPDATE "InventoryServer" i SET "countryCode"=p."countryCode", "os"=CASE WHEN p.os LIKE 'Windows%' THEN 'Windows' WHEN p.os LIKE 'Ubuntu%' THEN 'Ubuntu' ELSE 'Linux' END FROM "Plan" p WHERE p.id=i."planId";
