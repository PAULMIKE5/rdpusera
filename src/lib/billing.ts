import { atomic } from "./db";
import { HttpError } from "./security";
export async function credit(
  paymentId: string,
  provider: string,
  cents: number,
  providerId: string,
) {
  return atomic(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId } });
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
    await tx.user.update({
      where: { id: p.userId },
      data: { wallet: { increment: p.cents } },
    });
    await tx.ledger.create({
      data: {
        userId: p.userId,
        amount: p.cents,
        kind: "FUNDING",
        reference: `payment:${p.id}`,
      },
    });
  });
}
