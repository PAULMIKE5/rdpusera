-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Instance" ADD COLUMN     "controlMode" TEXT NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "inventoryId" TEXT,
ADD COLUMN     "orderItemId" TEXT,
ADD COLUMN     "port" INTEGER NOT NULL DEFAULT 3389;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "orderId" TEXT;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemKey" (
    "name" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemKey_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "totalCents" INTEGER NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "paymentInstructions" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "cpu" INTEGER NOT NULL,
    "ram" INTEGER NOT NULL,
    "disk" INTEGER NOT NULL,
    "cents" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryServer" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 3389,
    "username" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryServer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_region_name_key" ON "Location"("region", "name");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_requestKey_key" ON "Order"("userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryServer_ip_port_key" ON "InventoryServer"("ip", "port");

-- CreateIndex
CREATE UNIQUE INDEX "Instance_inventoryId_key" ON "Instance"("inventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Instance_orderItemId_key" ON "Instance"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "InventoryServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryServer" ADD CONSTRAINT "InventoryServer_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Preserve existing catalog locations while introducing editable location records.
INSERT INTO "Location" (id,name,region,enabled)
SELECT 'location-' || md5(region || ':' || location), location, region, true
FROM "Plan" GROUP BY region,location;
UPDATE "Plan" p SET "locationId"=l.id FROM "Location" l WHERE p.region=l.region AND p.location=l.name;

-- No payment provider is enabled until an administrator explicitly configures it.
INSERT INTO "PaymentMethod" (id,label,provider,instructions,enabled) VALUES
('stripe','Card (Stripe)','stripe','',false),
('crypto','Crypto','crypto','',false),
('manual','Bank transfer','manual','Contact the administrator for verified payment instructions.',false);

ALTER TABLE "Order" ADD CONSTRAINT "order_amount_positive" CHECK ("totalCents">0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_amount_positive" CHECK (cents>0);
CREATE UNIQUE INDEX "manual_live_address_unique" ON "Instance"(ip,port)
WHERE "controlMode"='MANUAL' AND status IN ('ACTIVE','RESTARTING','TERMINATING') AND ip IS NOT NULL;
