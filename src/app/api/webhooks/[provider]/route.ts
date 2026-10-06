import { createHmac } from "node:crypto";
import { systemKey } from "@/lib/config";
import { HttpError } from "@/lib/security";
import { route, json } from "@/lib/http";
import { equalSignature, nowSignature } from "@/lib/gateway-security";
import {
  verifyNowPayment,
  verifyFlutterwavePayment,
} from "@/lib/payment-verification";
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
  if (!event || typeof event !== "object")
    throw new HttpError(400, "Invalid event");
  if (provider === "flutterwave") {
    const secret = await systemKey("FLUTTERWAVE_WEBHOOK_SECRET"),
      modern = req.headers.get("flutterwave-signature");
    const valid =
      modern !== null
        ? equalSignature(
            modern,
            createHmac("sha256", secret).update(raw).digest("base64"),
          )
        : equalSignature(req.headers.get("verif-hash") ?? "", secret);
    if (!valid) throw new HttpError(401, "Invalid signature");
    if (event.event === "charge.completed")
      await verifyFlutterwavePayment(String(event.data?.id ?? ""));
  } else {
    if (
      !equalSignature(
        req.headers.get("x-nowpayments-sig") ?? "",
        nowSignature(event, await systemKey("NOWPAYMENTS_IPN_SECRET")),
      )
    )
      throw new HttpError(401, "Invalid signature");
    await verifyNowPayment(String(event.payment_id ?? ""));
  }
  return json({ received: true });
});
