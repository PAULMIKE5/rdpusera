ALTER TABLE "User" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '', ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '', ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Audit" ADD COLUMN "details" JSONB;
CREATE TABLE "Conversation" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "adminReadAt" TIMESTAMP(3), "userReadAt" TIMESTAMP(3));
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");
CREATE TABLE "ChatMessage" ("id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE, "senderId" TEXT NOT NULL, "senderRole" TEXT NOT NULL, "body" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "ChatMessage_senderId_requestKey_key" ON "ChatMessage"("senderId", "requestKey");
CREATE INDEX "ChatMessage_conversationId_createdAt_id_idx" ON "ChatMessage"("conversationId", "createdAt", "id");
CREATE TABLE "EmailAttempt" ("id" TEXT PRIMARY KEY, "purpose" TEXT NOT NULL, "status" TEXT NOT NULL, "code" TEXT NOT NULL, "httpStatus" INTEGER, "providerId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "EmailAttempt_createdAt_idx" ON "EmailAttempt"("createdAt");

ALTER TABLE "Payment" ADD COLUMN "gatewayPaymentId" TEXT, ADD COLUMN "gatewayStatus" TEXT, ADD COLUMN "checkedAt" TIMESTAMP(3);
