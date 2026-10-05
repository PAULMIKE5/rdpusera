import { createHmac } from "node:crypto";
import { systemKey } from "@/lib/config";
import { HttpError } from "@/lib/security";
import { route, json } from "@/lib/http";
import { credit } from "@/lib/billing";
import { db } from "@/lib/db";
import { gatewayFetch } from "@/lib/payments";
import {
  equalSignature,
  nowSignature,
  fiatCents,
  fullyPaid,
} from "@/lib/gateway-security";
export const POST = route(async (req) => {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 262144)
    throw new HttpError(413, "Payload too large");
  const provider = new URL(req.url).pathname.split("/").pop();
  if (provider !== "flutterwave" && provider !== "nowpayments")
    throw new HttpError(404, "Not found");
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  let verified,
    paymentId: string,
    providerId: string,
    transactionId: string,
    amount: number;
  if (provider === "flutterwave") {
    const secret = await systemKey("FLUTTERWAVE_WEBHOOK_SECRET");
    const modern = req.headers.get("flutterwave-signature");
    const valid =
      modern !== null
        ? equalSignature(
            modern,
            createHmac("sha256", secret).update(raw).digest("base64"),
          )
        : equalSignature(req.headers.get("verif-hash") ?? "", secret);
    if (!valid) throw new HttpError(401, "Invalid signature");
    if (event.event !== "charge.completed") return json({ received: true });
    const id = String(event.data?.id ?? "");
    if (!/^\d+$/.test(id)) throw new HttpError(400, "Invalid transaction ID");
    const r = await gatewayFetch(
      `https://api.flutterwave.com/v3/transactions/${id}/verify`,
      await systemKey("FLUTTERWAVE_SECRET_KEY"),
    );
    verified = r.data;
    if (r.status !== "success" || verified?.status !== "successful")
      return json({ received: true });
    if (verified.currency !== "USD" || String(verified.id) !== id)
      throw new HttpError(400, "Payment mismatch");
    paymentId = String(verified.tx_ref);
    providerId = paymentId;
    transactionId = `flutterwave:${id}`;
    amount = fiatCents(verified.amount);
  } else {
    if (
      !equalSignature(
        req.headers.get("x-nowpayments-sig") ?? "",
        nowSignature(event, await systemKey("NOWPAYMENTS_IPN_SECRET")),
      )
    )
      throw new HttpError(401, "Invalid signature");
    const id = String(event.payment_id ?? "");
    if (!/^\d+$/.test(id)) throw new HttpError(400, "Invalid payment ID");
    verified = await gatewayFetch(
      `https://api.nowpayments.io/v1/payment/${id}`,
      await systemKey("NOWPAYMENTS_API_KEY"),
      {},
      true,
    );
    if (verified.payment_status !== "finished") return json({ received: true });
    if (
      String(verified.payment_id) !== id ||
      String(verified.price_currency).toLowerCase() !== "usd" ||
      !fullyPaid(verified.actually_paid, verified.pay_amount)
    )
      throw new HttpError(400, "Payment amount or currency mismatch");
    paymentId = String(verified.order_id);
    providerId = String(verified.invoice_id ?? "");
    transactionId = `nowpayments:${id}`;
    amount = fiatCents(verified.price_amount);
  }
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (
    !p ||
    p.provider !== provider ||
    p.cents !== amount ||
    !providerId ||
    (p.providerId && p.providerId !== providerId)
  )
    throw new HttpError(400, "Payment mismatch");
  // A verified callback can reconcile an invoice whose creation response was lost.
  await credit(p.id, provider, amount, providerId, transactionId);
  return json({ received: true });
});
