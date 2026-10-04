import Stripe from "stripe";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { required, HttpError } from "@/lib/security";
import { route, json } from "@/lib/http";
import { credit } from "@/lib/billing";
export const POST = route(async (req) => {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 262144)
    throw new HttpError(413, "Payload too large");
  const provider = new URL(req.url).pathname.split("/").pop();
  if (provider === "stripe") {
    const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        raw,
        req.headers.get("stripe-signature") ?? "",
        required("STRIPE_WEBHOOK_SECRET"),
      );
    } catch {
      throw new HttpError(400, "Invalid signature");
    }
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    ) {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.payment_status === "paid") {
        if (
          s.currency !== "usd" ||
          !s.metadata?.paymentId ||
          s.amount_total === null
        )
          throw new HttpError(400, "Invalid payment");
        await credit(s.metadata.paymentId, "stripe", s.amount_total, s.id);
      }
    }
    return json({ received: true });
  }
  if (provider !== "crypto") throw new HttpError(404, "Not found");
  const timestamp = req.headers.get("x-webhook-timestamp") ?? "";
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    throw new HttpError(400, "Expired signature");
  const expected = createHmac("sha256", required("CRYPTO_WEBHOOK_SECRET"))
    .update(`${timestamp}.${raw}`)
    .digest();
  const sig = Buffer.from(req.headers.get("x-webhook-signature") ?? "", "hex");
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected))
    throw new HttpError(400, "Invalid signature");
  const data = z
    .object({
      paymentId: z.string(),
      providerId: z.string(),
      cents: z.number().int().positive(),
      currency: z.literal("USD"),
      status: z.enum(["confirmed", "pending", "failed"]),
    })
    .parse(JSON.parse(raw));
  if (data.status === "confirmed")
    await credit(data.paymentId, "crypto", data.cents, data.providerId);
  return json({ received: true });
});
