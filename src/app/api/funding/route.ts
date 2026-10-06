import { paymentCents } from "@/lib/money";
import { z } from "zod";
import { auth, origin, limit, HttpError, demo } from "@/lib/security";
import { route, json, body } from "@/lib/http";
import { db } from "@/lib/db";
import { credit } from "@/lib/billing";
import { checkoutPayment } from "@/lib/payments";
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth();
  await limit(`fund:${user.id}`, 10);
  const s = z
    .object({
      cents: paymentCents,
      provider: z.enum(["flutterwave", "nowpayments", "demo"]),
      requestKey: z.string().uuid(),
    })
    .parse(await body(req));
  if (s.provider === "demo") {
    if (!demo()) throw new HttpError(403, "Demo funding disabled");
  } else if (
    !(await db.paymentMethod.findFirst({
      where: { provider: s.provider, enabled: true },
    }))
  )
    throw new HttpError(409, "Payment method disabled");
  const p = await db.payment.upsert({
    where: { userId_requestKey: { userId: user.id, requestKey: s.requestKey } },
    create: { userId: user.id, ...s },
    update: {},
  });
  if (p.cents !== s.cents || p.provider !== s.provider || p.orderId)
    throw new HttpError(409, "Idempotency key reused");
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
        status: true,
        gatewayStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  );
});
