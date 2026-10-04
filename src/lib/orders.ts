import { z } from "zod";
import { atomic } from "./db";
import { HttpError } from "./security";
import { specs, price } from "./domain";
export async function purchase(userId: string, s: z.infer<typeof specs>) {
  return atomic(async (tx) => {
    const existing = await tx.instance.findUnique({
      where: {
        userId_requestKey: { userId: userId, requestKey: s.requestKey },
      },
    });
    if (existing) {
      if (
        existing.planId !== s.planId ||
        existing.cpu !== s.cpu ||
        existing.ram !== s.ram ||
        existing.disk !== s.disk
      )
        throw new HttpError(
          409,
          "Idempotency key reused for different specifications",
        );
      return { id: existing.id };
    }
    const plan = await tx.plan.findUnique({ where: { id: s.planId } });
    if (!plan || !plan.enabled) throw new HttpError(404, "Plan unavailable");
    if (s.cpu < plan.cpu || s.ram < plan.ram || s.disk < plan.disk)
      throw new HttpError(400, "Below plan minimums");
    const cents = price(plan, s);
    const funds = await tx.user.updateMany({
      where: { id: userId, wallet: { gte: cents }, disabled: false },
      data: { wallet: { decrement: cents } },
    });
    if (!funds.count) throw new HttpError(402, "Insufficient wallet balance");
    const inventory = await tx.plan.updateMany({
      where: { id: plan.id, stock: { gt: 0 } },
      data: { stock: { decrement: 1 } },
    });
    if (!inventory.count) throw new HttpError(409, "Sold out");
    const instance = await tx.instance.create({
      data: {
        userId: userId,
        planId: plan.id,
        cpu: s.cpu,
        ram: s.ram,
        disk: s.disk,
        priceCents: cents,
        requestKey: s.requestKey,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    await tx.ledger.create({
      data: {
        userId: userId,
        amount: -cents,
        kind: "PURCHASE",
        reference: `instance:${instance.id}`,
      },
    });
    await tx.job.create({
      data: { instanceId: instance.id, action: "PROVISION" },
    });
    return { id: instance.id };
  });
}
