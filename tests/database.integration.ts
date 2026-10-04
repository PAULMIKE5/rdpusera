import { purchase } from "../src/lib/orders";
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { db, atomic } from "../src/lib/db";
import { credit } from "../src/lib/billing";
if (
  process.env.RUN_DB_TESTS !== "true" ||
  !process.env.DATABASE_URL?.includes("globalrdp_test")
)
  throw Error("Use a dedicated globalrdp_test database and RUN_DB_TESTS=true");
test("duplicate concurrent callbacks credit only once; mismatches never credit", async () => {
  const u = await db.user.create({
    data: { email: `${crypto.randomUUID()}@test.invalid`, password: "unused" },
  });
  try {
    const p = await db.payment.create({
      data: {
        userId: u.id,
        cents: 500,
        provider: "crypto",
        providerId: crypto.randomUUID(),
        requestKey: crypto.randomUUID(),
      },
    });
    await assert.rejects(credit(p.id, "crypto", 501, p.providerId!));
    await Promise.all(
      Array.from({ length: 8 }, () =>
        credit(p.id, "crypto", 500, p.providerId!),
      ),
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } })).wallet,
      500,
    );
    assert.equal(await db.ledger.count({ where: { userId: u.id } }), 1);
  } finally {
    await db.ledger.deleteMany({ where: { userId: u.id } });
    await db.payment.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
  }
});
test("concurrent conditional debits cannot overdraw a wallet", async () => {
  const u = await db.user.create({
    data: {
      email: `${crypto.randomUUID()}@test.invalid`,
      password: "unused",
      wallet: 500,
    },
  });
  try {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        atomic(async (tx) =>
          tx.user.updateMany({
            where: { id: u.id, wallet: { gte: 400 } },
            data: { wallet: { decrement: 400 } },
          }),
        ),
      ),
    );
    assert.equal(
      results.reduce((s, r) => s + r.count, 0),
      1,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } })).wallet,
      100,
    );
  } finally {
    await db.user.delete({ where: { id: u.id } });
  }
});
test.after(() => db.$disconnect());

test("checkout is idempotent, stock cannot oversell, failed purchases roll back", async () => {
  const u = await db.user.create({
    data: {
      email: `${crypto.randomUUID()}@test.invalid`,
      password: "unused",
      wallet: 10000,
    },
  });
  const p = await db.plan.create({
    data: {
      name: "test",
      region: "US",
      location: "test",
      os: "Ubuntu 24.04",
      cpu: 2,
      ram: 4,
      disk: 80,
      baseCents: 1000,
      stock: 1,
    },
  });
  const s = {
    planId: p.id,
    cpu: 2,
    ram: 4,
    disk: 80,
    requestKey: crypto.randomUUID(),
  };
  try {
    const first = await purchase(u.id, s);
    assert.deepEqual(await purchase(u.id, s), first);
    await assert.rejects(purchase(u.id, { ...s, cpu: 4 }));
    await assert.rejects(
      purchase(u.id, { ...s, requestKey: crypto.randomUUID() }),
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } })).wallet,
      9000,
    );
    assert.equal(
      (await db.plan.findUniqueOrThrow({ where: { id: p.id } })).stock,
      0,
    );
    assert.equal(await db.instance.count({ where: { userId: u.id } }), 1);
    assert.equal(
      await db.job.count({ where: { instance: { userId: u.id } } }),
      1,
    );
  } finally {
    await db.job.deleteMany({ where: { instance: { userId: u.id } } });
    await db.instance.deleteMany({ where: { userId: u.id } });
    await db.ledger.deleteMany({ where: { userId: u.id } });
    await db.plan.delete({ where: { id: p.id } });
    await db.user.delete({ where: { id: u.id } });
  }
});
