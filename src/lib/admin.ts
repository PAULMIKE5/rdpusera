import { randomUUID } from "node:crypto";
import { atomic } from "./db";
import { HttpError } from "./security";
import { activatePaidOrder } from "./orders";
export async function confirmManualPayment(actorId: string, orderId: string) {
  return atomic(async (tx) => {
    const o = await tx.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!o?.payment || o.method !== "manual" || o.status !== "AWAITING_PAYMENT")
      throw new HttpError(409, "Only unpaid manual orders can be confirmed");
    await tx.payment.update({
      where: { id: o.payment.id },
      data: { status: "PAID", providerId: `manual:${o.id}` },
    });
    await activatePaidOrder(tx, o.id);
    await tx.audit.create({
      data: { actorId, action: "CONFIRM_MANUAL_PAYMENT", targetId: o.id },
    });
  });
}
export async function deleteAccount(actorId: string, userId: string) {
  return atomic(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u || u.deletedAt) throw new HttpError(404, "Account not found");
    if (u.role === "ADMIN" || u.id === actorId)
      throw new HttpError(409, "Administrator accounts cannot be deleted here");
    if (
      u.wallet !== 0 ||
      (await tx.instance.count({
        where: { userId, status: { not: "TERMINATED" } },
      })) ||
      (await tx.order.count({
        where: { userId, status: { in: ["AWAITING_PAYMENT", "PENDING"] } },
      })) ||
      (await tx.payment.count({ where: { userId, status: "PENDING" } }))
    )
      throw new HttpError(
        409,
        "Settle wallet funds, payments, orders and server instances before deleting this account",
      );
    await tx.conversation.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.emailVerification.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${randomUUID()}@deleted.invalid`,
        name: "Deleted account",
        countryCode: null,
        password: randomUUID(),
        disabled: true,
        deletedAt: new Date(),
      },
    });
    await tx.audit.create({
      data: { actorId, action: "DELETE_ACCOUNT", targetId: userId },
    });
  });
}
