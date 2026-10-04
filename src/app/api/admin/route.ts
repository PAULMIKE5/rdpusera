import { z } from "zod";
import { auth, origin, HttpError } from "@/lib/security";
import { route, json, body } from "@/lib/http";
import { db, atomic } from "@/lib/db";
export const GET = route(async () => {
  await auth(true);
  const [revenue, active, users, plans, jobs] = await Promise.all([
    db.ledger.aggregate({
      where: { kind: "PURCHASE" },
      _sum: { amount: true },
    }),
    db.instance.count({ where: { status: "ACTIVE" } }),
    db.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        disabled: true,
        wallet: true,
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    }),
    db.plan.findMany(),
    db.job.findMany({
      where: { state: "FAILED" },
      take: 100,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return json({
    revenue: -(revenue._sum.amount ?? 0),
    active,
    users,
    plans,
    jobs,
  });
});
export const POST = route(async (req) => {
  origin(req);
  const { user } = await auth(true);
  const s = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("stock"),
        id: z.string(),
        stock: z.number().int().min(0).max(10000),
      }),
      z.object({
        action: z.literal("disable"),
        id: z.string(),
        disabled: z.boolean(),
      }),
      z.object({ action: z.literal("retry"), id: z.string() }),
      z.object({
        action: z.literal("plan"),
        name: z.string().min(2).max(100),
        region: z.enum(["US", "EU", "ASIA"]),
        location: z.string().min(2).max(100),
        os: z.enum([
          "Windows Server 2019",
          "Windows Server 2022",
          "Ubuntu 24.04",
        ]),
        cpu: z.number().int().min(1).max(32),
        ram: z.number().int().min(1).max(128),
        disk: z.number().int().min(20).max(2000),
        baseCents: z.number().int().min(100).max(1000000),
        stock: z.number().int().min(0).max(10000),
      }),
    ])
    .parse(await body(req));
  await atomic(async (tx) => {
    if (s.action === "stock")
      await tx.plan.update({ where: { id: s.id }, data: { stock: s.stock } });
    if (s.action === "disable") {
      const target = await tx.user.findUnique({ where: { id: s.id } });
      if (!target || target.role === "ADMIN")
        throw new HttpError(400, "Cannot disable administrator");
      await tx.user.update({
        where: { id: s.id },
        data: { disabled: s.disabled },
      });
      if (s.disabled) await tx.session.deleteMany({ where: { userId: s.id } });
    }
    if (s.action === "retry")
      await tx.job.updateMany({
        where: { id: s.id, state: "FAILED" },
        data: { state: "PENDING", attempts: 0, runAt: new Date() },
      });
    if (s.action === "plan") {
      const { action, ...data } = s;
      await tx.plan.create({ data });
    }
    await tx.audit.create({
      data: {
        actorId: user.id,
        action: s.action,
        targetId: "id" in s ? s.id : "new-plan",
      },
    });
  });
  return json({ ok: true });
});
