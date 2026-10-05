import { db } from "@/lib/db";
import { route, json } from "@/lib/http";
import { z } from "zod";
export const GET = route(async (req) => {
  const q = z
    .object({
      region: z.string().max(40).optional(),
      os: z.string().max(100).optional(),
      cpu: z.coerce.number().int().min(0).max(32).default(0),
      ram: z.coerce.number().int().min(0).max(128).default(0),
      disk: z.coerce.number().int().min(0).max(2000).default(0),
    })
    .parse(Object.fromEntries(new URL(req.url).searchParams));
  return json(
    await db.plan.findMany({
      where: {
        enabled: true,
        OR: [{ locationId: null }, { siteLocation: { enabled: true } }],
        region: q.region,
        os: q.os,
        cpu: { gte: q.cpu },
        ram: { gte: q.ram },
        disk: { gte: q.disk },
      },
      orderBy: { baseCents: "asc" },
    }),
  );
});
