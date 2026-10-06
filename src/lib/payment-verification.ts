import { db } from "./db";
import { HttpError } from "./security";
import { systemKey } from "./config";
import { gatewayFetch } from "./payments";
import { fiatCents, fullyPaid } from "./gateway-security";
import { credit } from "./billing";
export async function verifyNowPayment(id: string, expectedPaymentId?: string) {
  if (!/^\d{1,40}$/.test(id))
    throw new HttpError(400, "Invalid provider payment ID");
  const v = await gatewayFetch(
    `https://api.nowpayments.io/v1/payment/${id}`,
    await systemKey("NOWPAYMENTS_API_KEY"),
    {},
    true,
  );
  const p = await db.payment.findUnique({
    where: { id: String(v.order_id ?? "") },
  });
  if (
    !p ||
    p.provider !== "nowpayments" ||
    (expectedPaymentId && p.id !== expectedPaymentId) ||
    String(v.payment_id) !== id ||
    !v.invoice_id ||
    (p.providerId && p.providerId !== String(v.invoice_id)) ||
    !p.checkoutStarted ||
    String(v.price_currency).toLowerCase() !== "usd" ||
    fiatCents(v.price_amount) !== p.cents
  )
    throw new HttpError(400, "Payment amount, currency or reference mismatch");
  const status = [
    "waiting",
    "confirming",
    "confirmed",
    "sending",
    "partially_paid",
    "finished",
    "failed",
    "refunded",
    "expired",
  ].includes(v.payment_status)
    ? v.payment_status
    : "unknown";
  // Remember the provider's payment ID from early IPNs, not just the final callback.
  if (p.status !== "PAID")
    await db.payment.update({
      where: { id: p.id },
      data: {
        gatewayPaymentId: id,
        gatewayStatus: status,
        checkedAt: new Date(),
      },
    });
  if (status === "finished") {
    if (!fullyPaid(v.actually_paid, v.pay_amount))
      throw new HttpError(400, "Payment is not fully funded; contact support");
    await credit(
      p.id,
      "nowpayments",
      p.cents,
      String(v.invoice_id),
      `nowpayments:${id}`,
    );
  }
  return p.id;
}
export async function verifyFlutterwavePayment(
  id: string,
  expectedPaymentId?: string,
) {
  if (!/^\d{1,40}$/.test(id))
    throw new HttpError(400, "Invalid transaction ID");
  const r = await gatewayFetch(
    `https://api.flutterwave.com/v3/transactions/${id}/verify`,
    await systemKey("FLUTTERWAVE_SECRET_KEY"),
  );
  const v = r.data;
  if (r.status !== "success" || !v)
    throw new HttpError(502, "Unable to verify this transaction");
  const p = await db.payment.findUnique({
    where: { id: String(v.tx_ref ?? "") },
  });
  if (
    !p ||
    p.provider !== "flutterwave" ||
    (expectedPaymentId && p.id !== expectedPaymentId) ||
    String(v.id) !== id ||
    v.currency !== "USD" ||
    fiatCents(v.amount) !== p.cents ||
    !p.checkoutStarted
  )
    throw new HttpError(400, "Payment amount, currency or reference mismatch");
  if (p.status !== "PAID")
    await db.payment.update({
      where: { id: p.id },
      data: {
        gatewayPaymentId: id,
        gatewayStatus: String(v.status),
        checkedAt: new Date(),
      },
    });
  if (v.status === "successful")
    await credit(p.id, "flutterwave", p.cents, p.id, `flutterwave:${id}`);
  return p.id;
}
export async function reconcilePayment(
  userId: string,
  paymentId: string,
  providerPaymentId?: string,
  admin = false,
) {
  const p = await db.payment.findFirst({
    where: { id: paymentId, ...(admin ? {} : { userId }) },
  });
  if (!p) throw new HttpError(404, "Payment not found");
  if (p.status !== "PAID") {
    const id = providerPaymentId || p.gatewayPaymentId;
    if (id) {
      if (p.provider === "nowpayments") await verifyNowPayment(id, p.id);
      else if (p.provider === "flutterwave")
        await verifyFlutterwavePayment(id, p.id);
    }
  }
  const result = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
  return {
    id: p.id,
    status: result.status,
    gatewayStatus: result.gatewayStatus,
    needsProviderId: !result.gatewayPaymentId && result.status !== "PAID",
    destination: p.orderId ? "/dashboard/orders" : "/dashboard/billing",
  };
}
