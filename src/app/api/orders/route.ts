import { z } from "zod";
import { auth, origin, limit, HttpError } from "@/lib/security";
import { route, json, body } from "@/lib/http";
import { db } from "@/lib/db";
import { cancelUnpaid } from "@/lib/orders";
import { checkoutPayment } from "@/lib/payments";
export const GET = route(async () => {
  const { user } = await auth();
  const rows = await db.order.findMany({
    where: { userId: user.id, deletedAt: null },
    include: {
      payment: { select: { id: true, status: true, gatewayStatus: true } },
      items: { include: { instance: { select: { id: true, status: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json(rows.map(({ notes, ...order }) => order));
});
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth();
  await limit(`orders:${user.id}`, 15);
  const s = z
    .object({ id: z.string(), action: z.enum(["pay", "cancel"]) })
    .parse(await body(req));
  if (s.action === "cancel") {
    await cancelUnpaid(user.id, s.id);
    return json({ ok: true });
  }
  const o = await db.order.findFirst({
    where: { id: s.id, userId: user.id, deletedAt: null },
    include: { payment: true },
  });
  if (!o) throw new HttpError(404, "Order not found");
  if (o.status !== "AWAITING_PAYMENT" || !o.payment)
    throw new HttpError(409, "Order does not need payment");
  return json(await checkoutPayment(o.payment.id));
});
