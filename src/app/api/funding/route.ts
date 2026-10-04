import { z } from "zod";
import Stripe from "stripe";
import { auth, origin, limit, HttpError, demo, required } from "@/lib/security";
import { route, json, body } from "@/lib/http";
import { db } from "@/lib/db";
import { credit } from "@/lib/billing";
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth();
  await limit(`fund:${user.id}`, 10);
  const s = z
    .object({
      cents: z.number().int().min(500).max(100000),
      provider: z.enum(["stripe", "crypto", "demo"]),
      requestKey: z.string().uuid(),
    })
    .parse(await body(req));
  if (s.provider === "demo" && !demo())
    throw new HttpError(403, "Demo funding disabled");
  const p = await db.payment.upsert({
    where: { userId_requestKey: { userId: user.id, requestKey: s.requestKey } },
    create: { userId: user.id, ...s },
    update: {},
  });
  if (p.cents !== s.cents || p.provider !== s.provider)
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
  if (s.provider === "stripe") {
    const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: p.id,
        metadata: { paymentId: p.id },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: p.cents,
              product_data: { name: "GlobalRDP wallet credit" },
            },
          },
        ],
        success_url: `${required("APP_URL")}/?billing=success`,
        cancel_url: `${required("APP_URL")}/?billing=cancelled`,
      },
      { idempotencyKey: p.id },
    );
    await db.payment.update({
      where: { id: p.id },
      data: { providerId: session.id },
    });
    return json({ url: session.url });
  }
  const gateway = new URL(required("CRYPTO_CHECKOUT_URL"));
  if (gateway.protocol !== "https:")
    throw new HttpError(503, "Crypto gateway must use HTTPS");
  const r = await fetch(gateway, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${required("CRYPTO_API_KEY")}`,
      "Idempotency-Key": p.id,
    },
    body: JSON.stringify({
      paymentId: p.id,
      cents: p.cents,
      currency: "USD",
      callbackUrl: `${required("APP_URL")}/api/webhooks/crypto`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new HttpError(502, "Crypto gateway unavailable");
  const result = z
    .object({ id: z.string(), url: z.string().url().startsWith("https://") })
    .parse(await r.json());
  await db.payment.update({
    where: { id: p.id },
    data: { providerId: result.id },
  });
  return json({ url: result.url });
});
