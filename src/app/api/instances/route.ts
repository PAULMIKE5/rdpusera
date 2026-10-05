import { purchase } from "@/lib/orders";
import { auth, origin, limit } from "@/lib/security";
import { route, json, body } from "@/lib/http";
import { db } from "@/lib/db";
import { specs } from "@/lib/domain";
export const GET = route(async () => {
  const { user } = await auth();
  const rows = await db.instance.findMany({
    where: { userId: user.id },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  return json(
    rows.map(({ secret, ...r }) => ({
      ...r,
      plan: {
        ...r.plan,
        os: r.os ?? r.plan.os,
        location: r.location ?? r.plan.location,
      },
      bandwidthBytes: r.bandwidthBytes.toString(),
    })),
  );
});
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth();
  await limit(`buy:${user.id}`, 10);
  const s = specs.parse(await body(req));
  const result = await purchase(user.id, s);
  return json(result, 201);
});
