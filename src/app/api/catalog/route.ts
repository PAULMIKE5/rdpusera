import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { z } from "zod";
export const GET = route(async (req) => {
  const p = Object.fromEntries(new URL(req.url).searchParams);
  const q = z
    .object({
      region: z.enum(["US", "EU", "ASIA"]).optional(),
      os: z
        .enum(["Windows Server 2019", "Windows Server 2022", "Ubuntu 24.04"])
        .optional(),
      cpu: z.coerce.number().int().min(0).max(32).default(0),
      ram: z.coerce.number().int().min(0).max(128).default(0),
      disk: z.coerce.number().int().min(0).max(2000).default(0),
    })
    .parse(p);
  return json(
    await db.plan.findMany({
      where: {
        enabled: true,
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
