import { z } from "zod";
import { Prisma } from "@prisma/client";
import { atomic } from "./db";
import { HttpError, encrypt } from "./security";
import { price, specs } from "./domain";
import {
  checkoutInput,
  fingerprint,
  connectionInput,
  deliveryInput,
} from "./checkout-domain";
export async function activatePaidOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  if (order.status !== "AWAITING_PAYMENT")
    throw new HttpError(409, "Order cannot be paid in this state");
  await tx.order.update({
    where: { id: orderId },
    data: { status: "PENDING", paidAt: new Date() },
  });
  for (const item of order.items)
    await tx.instance.create({
      data: {
        userId: order.userId,
        planId: item.planId,
        orderItemId: item.id,
        cpu: item.cpu,
        ram: item.ram,
        disk: item.disk,
        priceCents: item.cents,
        requestKey: `order-item:${item.id}`,
        status: "PENDING",
        controlMode: "MANUAL",
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
  await tx.ledger.create({
    data: {
      userId: order.userId,
      amount: -order.totalCents,
      kind: "PURCHASE",
      reference: `order:${order.id}`,
    },
  });
}
export async function checkout(
  userId: string,
  input: z.infer<typeof checkoutInput>,
) {
  const s = checkoutInput.parse(input),
    hash = fingerprint(s);
  return atomic(async (tx) => {
    const existing = await tx.order.findUnique({
      where: { userId_requestKey: { userId, requestKey: s.requestKey } },
    });
    if (existing) {
      if (existing.requestHash !== hash)
        throw new HttpError(
          409,
          "Checkout key already used for a different cart",
        );
      return existing;
    }
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.disabled || user.deletedAt)
      throw new HttpError(403, "Account unavailable");
    const method =
      s.method === "wallet"
        ? { provider: "wallet", instructions: "" }
        : await tx.paymentMethod.findFirst({
            where: { id: s.method, enabled: true },
          });
    if (!method) throw new HttpError(409, "Payment method unavailable");
    const items: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    let totalCents = 0;
    for (const line of s.lines) {
      const plan = await tx.plan.findUnique({
        where: { id: line.planId },
        include: { siteLocation: true },
      });
      if (!plan?.enabled || plan.siteLocation?.enabled === false)
        throw new HttpError(409, "A plan or location is unavailable");
      if (line.cpu < plan.cpu || line.ram < plan.ram || line.disk < plan.disk)
        throw new HttpError(400, "Configuration below plan minimum");
      const cents = price(plan, line);
      const stock = await tx.plan.updateMany({
        where: { id: plan.id, stock: { gte: line.quantity } },
        data: { stock: { decrement: line.quantity } },
      });
      if (!stock.count)
        throw new HttpError(409, `${plan.name} has insufficient stock`);
      totalCents += cents * line.quantity;
      for (let n = 0; n < line.quantity; n++)
        items.push({
          plan: { connect: { id: plan.id } },
          name: plan.name,
          location: plan.location,
          os: plan.os,
          cpu: line.cpu,
          ram: line.ram,
          disk: line.disk,
          cents,
        });
    }
    const order = await tx.order.create({
      data: {
        userId,
        requestKey: s.requestKey,
        requestHash: hash,
        method: method.provider,
        paymentInstructions: method.instructions,
        totalCents,
        items: { create: items },
      },
    });
    if (method.provider === "wallet") {
      const debit = await tx.user.updateMany({
        where: { id: userId, wallet: { gte: totalCents }, disabled: false },
        data: { wallet: { decrement: totalCents } },
      });
      if (!debit.count)
        throw new HttpError(
          402,
          "Insufficient wallet balance. Add funds or choose another payment method.",
        );
      await activatePaidOrder(tx, order.id);
    } else
      await tx.payment.create({
        data: {
          userId,
          orderId: order.id,
          cents: totalCents,
          provider: method.provider,
          requestKey: `checkout:${order.id}`,
        },
      });
    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  });
}
// Legacy endpoint also follows the new manual-delivery path; it cannot bypass checkout.
export async function purchase(userId: string, s: z.infer<typeof specs>) {
  const order = await checkout(userId, {
    requestKey: s.requestKey,
    method: "wallet",
    lines: [
      { planId: s.planId, cpu: s.cpu, ram: s.ram, disk: s.disk, quantity: 1 },
    ],
  });
  return { id: order.id };
}
export async function fulfill(
  actorId: string,
  input: z.infer<typeof deliveryInput>,
) {
  const s = deliveryInput.parse(input);
  return atomic(async (tx) => {
    const instance = await tx.instance.findUnique({
      where: { id: s.id },
      include: { orderItem: { include: { order: true } } },
    });
    if (
      !instance?.orderItem ||
      instance.status !== "PENDING" ||
      instance.orderItem.order.status !== "PENDING"
    )
      throw new HttpError(
        409,
        "Only paid, pending order items may be delivered",
      );
    const user = await tx.user.findUniqueOrThrow({
      where: { id: instance.userId },
    });
    if (user.disabled || user.deletedAt)
      throw new HttpError(409, "Enable the customer account before delivery");
    let details: {
      ip: string;
      port: number;
      username: string;
      secret: string;
      inventoryId?: string;
    };
    if ("inventoryId" in s) {
      const server = await tx.inventoryServer.findUnique({
        where: { id: s.inventoryId },
      });
      if (
        !server ||
        server.state !== "AVAILABLE" ||
        server.planId !== instance.planId
      )
        throw new HttpError(
          409,
          "Inventory server unavailable or does not match this plan",
        );
      const plan = await tx.plan.findUniqueOrThrow({
        where: { id: instance.planId },
      });
      if (
        instance.cpu > plan.cpu ||
        instance.ram > plan.ram ||
        instance.disk > plan.disk
      )
        throw new HttpError(
          409,
          "Customized orders require manually verified server details",
        );
      await tx.inventoryServer.update({
        where: { id: server.id },
        data: { state: "ASSIGNED" },
      });
      details = {
        ip: server.ip,
        port: server.port,
        username: server.username,
        secret: server.secret,
        inventoryId: server.id,
      };
    } else
      details = {
        ip: s.ip,
        port: s.port,
        username: s.username,
        secret: encrypt(s.password),
      };
    await tx.instance.update({
      where: { id: s.id },
      data: {
        ...details,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    const remaining = await tx.orderItem.count({
      where: {
        orderId: instance.orderItem.orderId,
        OR: [{ instance: null }, { instance: { status: "PENDING" } }],
      },
    });
    if (!remaining)
      await tx.order.update({
        where: { id: instance.orderItem.orderId },
        data: { status: "COMPLETE", completedAt: new Date() },
      });
    await tx.audit.create({
      data: { actorId, action: "FULFILL_ORDER_ITEM", targetId: s.id },
    });
  });
}
export async function cancelUnpaid(userId: string, id: string, admin = false) {
  return atomic(async (tx) => {
    const o = await tx.order.findFirst({
      where: { id, ...(admin ? {} : { userId }) },
      include: { items: true },
    });
    if (!o) throw new HttpError(404, "Order not found");
    if (o.status === "CANCELLED") return;
    if (o.status !== "AWAITING_PAYMENT")
      throw new HttpError(409, "Paid orders cannot be cancelled here");
    await tx.order.update({ where: { id }, data: { status: "CANCELLED" } });
    if (o.method === "manual")
      await tx.payment.updateMany({
        where: { orderId: id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    for (const i of o.items)
      await tx.plan.update({
        where: { id: i.planId },
        data: { stock: { increment: 1 } },
      });
    await tx.audit.create({
      data: { actorId: userId, action: "CANCEL_UNPAID_ORDER", targetId: id },
    });
  });
}
