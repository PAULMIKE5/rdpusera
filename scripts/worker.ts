import "./check-env";
import { db, atomic } from "../src/lib/db";
import { encrypt } from "../src/lib/security";
import { provider, provisionResult } from "../src/lib/provider";
import { z } from "zod";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
async function tick() {
  const expired = await db.instance.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: new Date() } },
    take: 50,
  });
  for (const i of expired)
    await atomic(async (tx) => {
      const r = await tx.instance.updateMany({
        where: { id: i.id, status: "ACTIVE" },
        data: { status: "TERMINATING" },
      });
      if (r.count)
        await tx.job.create({
          data: { instanceId: i.id, action: "TERMINATE" },
        });
    });
  const jobs = await db.$queryRaw<
    { id: string }[]
  >`UPDATE "Job" SET state='RUNNING', "lockedUntil"=NOW()+INTERVAL '2 minutes', attempts=attempts+1 WHERE id=(SELECT id FROM "Job" WHERE (state='PENDING' AND "runAt"<=NOW()) OR (state='RUNNING' AND "lockedUntil"<NOW()) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
  if (!jobs.length) return false;
  const job = await db.job.findUniqueOrThrow({
    where: { id: jobs[0].id },
    include: { instance: { include: { plan: true } } },
  });
  try {
    const result = await provider(job.action, job.id, {
      instanceId: job.instanceId,
      providerId: job.instance.providerId,
      cpu: job.instance.cpu,
      ram: job.instance.ram,
      disk: job.instance.disk,
      region: job.instance.plan.region,
      os: job.instance.plan.os,
    });
    await atomic(async (tx) => {
      const lease = await tx.job.updateMany({
        where: { id: job.id, state: "RUNNING", attempts: job.attempts },
        data: { state: "DONE", lockedUntil: null, error: null },
      });
      if (!lease.count) return;
      if (job.action === "PROVISION") {
        const r = provisionResult.parse(result);
        await tx.instance.update({
          where: { id: job.instanceId },
          data: {
            status: "ACTIVE",
            providerId: r.providerId,
            ip: r.ip,
            username: r.username,
            secret: encrypt(r.password),
          },
        });
      }
      if (job.action === "RESTART")
        await tx.instance.update({
          where: { id: job.instanceId },
          data: { status: "ACTIVE" },
        });
      if (job.action === "TERMINATE") {
        await tx.instance.update({
          where: { id: job.instanceId },
          data: { status: "TERMINATED", secret: null },
        });
        await tx.plan.update({
          where: { id: job.instance.planId },
          data: { stock: { increment: 1 } },
        });
      }
    });
  } catch {
    await db.job.updateMany({
      where: { id: job.id, state: "RUNNING", attempts: job.attempts },
      data: {
        state: job.attempts >= 5 ? "FAILED" : "PENDING",
        lockedUntil: null,
        error: "Provider operation failed; inspect provider logs using job ID",
        runAt: new Date(Date.now() + Math.min(300, 2 ** job.attempts) * 1000),
      },
    });
  }
  return true;
}
async function metrics() {
  const rows = await db.instance.findMany({
    where: { status: "ACTIVE" },
    take: 500,
  });
  for (const i of rows) {
    try {
      const r = z
        .object({
          uptimeSeconds: z.number().int().nonnegative().max(2147483647),
          bandwidthBytes: z.string().regex(/^\d{1,18}$/),
        })
        .parse(
          await provider(
            "METRICS",
            `metrics-${i.id}-${Math.floor(Date.now() / 60000)}`,
            { providerId: i.providerId },
          ),
        );
      await db.instance.update({
        where: { id: i.id },
        data: {
          uptimeSeconds: r.uptimeSeconds,
          bandwidthBytes: BigInt(r.bandwidthBytes),
        },
      });
    } catch {
      /* Keep last known metrics; no fabricated readings. */
    }
  }
}
async function main() {
  let last = 0;
  while (!stopping) {
    try {
      const busy = await tick();
      if (Date.now() - last > 60000) {
        await metrics();
        await db.session.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        await db.rateLimit.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        last = Date.now();
      }
      if (!busy) await new Promise((r) => setTimeout(r, 2000));
    } catch {
      console.error("Worker tick failed; retrying");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await db.$disconnect();
}
main();
