import { auth, origin, limit } from "@/lib/security";
import { route, body, json } from "@/lib/http";
import { checkoutInput } from "@/lib/checkout-domain";
import { checkout } from "@/lib/orders";
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth();
  await limit(`checkout:${user.id}`, 10);
  return json(
    await checkout(user.id, checkoutInput.parse(await body(req))),
    201,
  );
});
