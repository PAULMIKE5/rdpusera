import { db } from "./db";
import { HttpError, required } from "./security";
import { systemKey } from "./config";
export async function gatewayFetch(
  url: string,
  key: string,
  init: RequestInit = {},
  now = false,
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(now ? { "x-api-key": key } : { Authorization: `Bearer ${key}` }),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error(
      JSON.stringify({
        event: "gateway_request_failed",
        host: new URL(url).hostname,
        httpStatus: response.status,
      }),
    );
    throw new HttpError(
      502,
      "Payment provider unavailable. Check your payment status before trying again.",
    );
  }
  try {
    return await response.json();
  } catch {
    throw new HttpError(
      502,
      "Payment provider returned an unreadable response. Check payment status before retrying.",
    );
  }
}
export async function checkoutPayment(id: string) {
  const p = await db.payment.findUniqueOrThrow({
    where: { id },
    include: { user: true },
  });
  if (p.status === "PAID") return { paid: true };
  if (p.status !== "PENDING")
    throw new HttpError(409, "Payment is not pending");
  if (p.provider === "manual") return { manual: true };
  if (p.checkoutUrl) return { url: p.checkoutUrl };
  if (!["flutterwave", "nowpayments"].includes(p.provider))
    throw new HttpError(
      409,
      "Legacy payment requires administrator reconciliation",
    );
  const app = new URL(required("APP_URL")).origin;
  const key = await systemKey(
    p.provider === "flutterwave"
      ? "FLUTTERWAVE_SECRET_KEY"
      : "NOWPAYMENTS_API_KEY",
  );
  // These invoice APIs do not guarantee idempotency. Never create another invoice after an ambiguous timeout.
  const claim = await db.payment.updateMany({
    where: { id, checkoutStarted: false, status: "PENDING" },
    data: { checkoutStarted: true },
  });
  if (!claim.count)
    throw new HttpError(
      409,
      "Checkout is being prepared or needs administrator reconciliation. Do not pay twice.",
    );
  const destination = `${app}/payments/return?payment=${encodeURIComponent(p.id)}`;
  let providerId: string, url: string;
  if (p.provider === "flutterwave") {
    const r = await gatewayFetch(
      "https://api.flutterwave.com/v3/payments",
      key,
      {
        method: "POST",
        body: JSON.stringify({
          tx_ref: p.id,
          amount: (p.cents / 100).toFixed(2),
          currency: "USD",
          redirect_url: destination,
          customer: { email: p.user.email, name: p.user.name || p.user.email },
          customizations: { title: "GlobalRDP Hub" },
        }),
      },
    );
    if (r.status !== "success")
      throw new HttpError(502, "Flutterwave checkout was not created");
    providerId = p.id;
    url = r.data?.link;
  } else {
    const r = await gatewayFetch(
      "https://api.nowpayments.io/v1/invoice",
      key,
      {
        method: "POST",
        body: JSON.stringify({
          price_amount: p.cents / 100,
          price_currency: "usd",
          order_id: p.id,
          order_description: p.orderId
            ? `RDP order ${p.orderId}`
            : "Wallet funding",
          ipn_callback_url: `${app}/api/webhooks/nowpayments`,
          success_url: destination,
          cancel_url: destination,
        }),
      },
      true,
    );
    providerId = String(r.id ?? "");
    url = r.invoice_url;
  }
  if (!providerId || typeof url !== "string" || !url.startsWith("https://"))
    throw new HttpError(502, "Invalid checkout response; contact support");
  await db.payment.update({
    where: { id },
    data: { providerId, checkoutUrl: url },
  });
  return { url };
}
