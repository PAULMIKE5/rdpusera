import { atomic } from "./db";
import { HttpError } from "./security";
import { activatePaidOrder } from "./orders";
export async function credit(
  paymentId: string,
  provider: string,
  cents: number,
  providerId: string,
) {
  return atomic(async (tx) => {
    const p = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (
      !p ||
      p.provider !== provider ||
      p.cents !== cents ||
      p.providerId !== providerId
    )
      throw new HttpError(400, "Payment mismatch");
    if (p.status === "PAID") return;
    const updated = await tx.payment.updateMany({
      where: { id: p.id, status: "PENDING" },
      data: { status: "PAID" },
    });
    if (!updated.count) return;
    if (p.order && p.order.status === "AWAITING_PAYMENT") {
      await activatePaidOrder(tx, p.order.id);
      return;
    }
    // A late valid payment for a cancelled order is credited to the wallet; never oversell or lose funds.
    await tx.user.update({
      where: { id: p.userId },
      data: { wallet: { increment: p.cents } },
    });
    await tx.ledger.create({
      data: {
        userId: p.userId,
        amount: p.cents,
        kind: p.order ? "LATE_PAYMENT_CREDIT" : "FUNDING",
        reference: `payment:${p.id}`,
      },
    });
  });
}
