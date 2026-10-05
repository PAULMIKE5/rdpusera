import Stripe from "stripe";
import { z } from "zod";
import { db } from "./db";
import { HttpError, required } from "./security";
import { systemKey } from "./config";
export async function checkoutPayment(id: string) {
  const p = await db.payment.findUniqueOrThrow({ where: { id } });
  if (p.status === "PAID") return { paid: true };
  if (p.provider === "manual") return { manual: true };
  if (p.checkoutUrl) return { url: p.checkoutUrl };
  const app = required("APP_URL");
  const destination = p.orderId ? "/dashboard/orders" : "/dashboard/billing";
  if (p.provider === "stripe") {
    const stripe = new Stripe(await systemKey("STRIPE_SECRET_KEY"));
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
              product_data: {
                name: p.orderId
                  ? `RDP order ${p.orderId}`
                  : "GlobalRDP wallet credit",
              },
            },
          },
        ],
        success_url: `${app}${destination}?payment=success`,
        cancel_url: `${app}${destination}?payment=cancelled`,
      },
      { idempotencyKey: p.id },
    );
    await db.payment.update({
      where: { id },
      data: { providerId: session.id, checkoutUrl: session.url },
    });
    return { url: session.url };
  }
  if (p.provider !== "crypto") throw new HttpError(400, "Unsupported provider");
  const gateway = new URL(await systemKey("CRYPTO_CHECKOUT_URL"));
  if (gateway.protocol !== "https:")
    throw new HttpError(503, "Gateway requires HTTPS");
  const r = await fetch(gateway, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await systemKey("CRYPTO_API_KEY")}`,
      "Idempotency-Key": p.id,
    },
    body: JSON.stringify({
      paymentId: p.id,
      cents: p.cents,
      currency: "USD",
      callbackUrl: `${app}/api/webhooks/crypto`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new HttpError(502, "Payment gateway unavailable");
  const result = z
    .object({ id: z.string(), url: z.string().url().startsWith("https://") })
    .parse(await r.json());
  await db.payment.update({
    where: { id },
    data: { providerId: result.id, checkoutUrl: result.url },
  });
  return { url: result.url };
}
