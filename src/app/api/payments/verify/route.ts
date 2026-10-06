import { z } from "zod";
import { route, json, body } from "@/lib/http";
import { auth, origin, limit } from "@/lib/security";
import { reconcilePayment } from "@/lib/payment-verification";
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth();
  await limit(`payment-verify:${user.id}`, 12);
  const s = z
    .object({
      paymentId: z.string().min(1).max(100),
      providerPaymentId: z
        .string()
        .regex(/^\d{1,40}$/)
        .optional(),
    })
    .parse(await body(req));
  return json(
    await reconcilePayment(
      user.id,
      s.paymentId,
      s.providerPaymentId,
      user.role === "ADMIN",
    ),
  );
});
