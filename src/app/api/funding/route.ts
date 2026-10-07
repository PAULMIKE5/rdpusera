import { paymentCents } from "@/lib/money";
import { z } from "zod";
import { auth, origin, limit, HttpError, demo } from "@/lib/security";
import { route, json, body } from "@/lib/http";
import { db } from "@/lib/db";
import { credit } from "@/lib/billing";
import { createFundingPayment, checkoutPayment } from "@/lib/payments";
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth();
  await limit(`fund:${user.id}`, 10);
  const s = z
    .object({
      cents: paymentCents,
      provider: z.enum([
        "flutterwave",
        "flutterwave_ngn",
        "nowpayments",
        "demo",
      ]),
      requestKey: z.string().uuid(),
      method: z.string().min(1).max(100).optional(),
    })
    .parse(await body(req));
  if (s.provider === "demo" && !demo())
    throw new HttpError(403, "Demo funding disabled");
  const p = await createFundingPayment(user.id, s);
  if (p.status === "PAID") return json({ ok: true });
  if (s.provider === "demo") {
    await db.payment.update({
      where: { id: p.id },
      data: { providerId: p.id },
    });
    await credit(p.id, "demo", p.cents, p.id);
    return json({ ok: true });
  }
  return json(await checkoutPayment(p.id));
});

export const GET = route(async () => {
  const { user } = await auth();
  return json(
    await db.payment.findMany({
      where: { userId: user.id, orderId: null, deletedAt: null },
      select: {
        id: true,
        cents: true,
        provider: true,
        chargeCurrency: true,
        chargeAmount: true,
        status: true,
        gatewayStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  );
});
