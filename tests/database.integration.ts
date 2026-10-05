import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { checkout, fulfill, cancelUnpaid } from "../src/lib/orders";
import { credit } from "../src/lib/billing";
import { confirmManualPayment, deleteAccount } from "../src/lib/admin";
import { decrypt, encrypt } from "../src/lib/security";
if (
  process.env.RUN_DB_TESTS !== "true" ||
  new URL(process.env.DATABASE_URL ?? "http://invalid").pathname !==
    "/globalrdp_test"
)
  throw Error("Use a dedicated globalrdp_test database and RUN_DB_TESTS=true");
process.env.CREDENTIAL_KEY = "ab".repeat(32);
async function fixture(stock = 10, wallet = 10000) {
  const user = await db.user.create({
    data: {
      email: `${crypto.randomUUID()}@test.invalid`,
      password: "unused",
      wallet,
    },
  });
  const plan = await db.plan.create({
    data: {
      name: "Test server",
      region: "US",
      location: "New York",
      os: "Windows Server 2022",
      cpu: 2,
      ram: 4,
      disk: 80,
      baseCents: 1000,
      stock,
    },
  });
  return {
    user,
    plan,
    cart: (method = "wallet", quantity = 1) => ({
      requestKey: crypto.randomUUID(),
      method,
      lines: [{ planId: plan.id, cpu: 2, ram: 4, disk: 80, quantity }],
    }),
    async cleanup() {
      await db.audit.deleteMany({});
      await db.job.deleteMany({ where: { instance: { userId: user.id } } });
      await db.instance.deleteMany({ where: { userId: user.id } });
      await db.inventoryServer.deleteMany({ where: { planId: plan.id } });
      await db.payment.deleteMany({ where: { userId: user.id } });
      await db.orderItem.deleteMany({ where: { order: { userId: user.id } } });
      await db.order.deleteMany({ where: { userId: user.id } });
      await db.ledger.deleteMany({ where: { userId: user.id } });
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.plan.delete({ where: { id: plan.id } });
      await db.user.delete({ where: { id: user.id } });
    },
  };
}
async function method(provider: string) {
  return db.paymentMethod.create({
    data: { label: "Test", provider, enabled: true },
  });
}
test("wallet cart is atomic and idempotent; no auto-provisioning; complete only after all deliveries", async () => {
  const f = await fixture();
  try {
    const s = f.cart("wallet", 2),
      o = await checkout(f.user.id, s);
    assert.equal(o.status, "PENDING");
    assert.equal((await checkout(f.user.id, s)).id, o.id);
    await assert.rejects(
      checkout(f.user.id, { ...s, lines: [{ ...s.lines[0], quantity: 3 }] }),
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      8000,
    );
    const instances = await db.instance.findMany({
      where: { userId: f.user.id },
    });
    assert.equal(instances.length, 2);
    assert.ok(
      instances.every((i) => i.status === "PENDING" && i.secret === null),
    );
    assert.equal(
      await db.job.count({ where: { instance: { userId: f.user.id } } }),
      0,
    );
    await fulfill("test-admin", {
      id: instances[0].id,
      ip: "192.0.2.1",
      port: 3389,
      username: "Administrator",
      password: "server-secret",
    });
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      "PENDING",
    );
    await fulfill("test-admin", {
      id: instances[1].id,
      ip: "192.0.2.2",
      port: 3389,
      username: "Administrator",
      password: "server-secret",
    });
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      "COMPLETE",
    );
    const delivered = await db.instance.findUniqueOrThrow({
      where: { id: instances[0].id },
    });
    assert.equal(decrypt(delivered.secret!), "server-secret");
    assert.ok(delivered.expiresAt.getTime() > Date.now() + 29 * 86400000);
    await assert.rejects(
      fulfill("test-admin", {
        id: instances[0].id,
        ip: "192.0.2.3",
        port: 3389,
        username: "Administrator",
        password: "different",
      }),
    );
  } finally {
    await f.cleanup();
  }
});
test("concurrent checkouts cannot oversell and failed purchases roll back wallet debits", async () => {
  const f = await fixture(1);
  try {
    const results = await Promise.allSettled([
      checkout(f.user.id, f.cart()),
      checkout(f.user.id, f.cart()),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (await db.plan.findUniqueOrThrow({ where: { id: f.plan.id } })).stock,
      0,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      9000,
    );
  } finally {
    await f.cleanup();
  }
});
test("insufficient wallet rolls back reservations and order creation", async () => {
  const f = await fixture(3, 0);
  try {
    await assert.rejects(checkout(f.user.id, f.cart()));
    assert.equal(
      (await db.plan.findUniqueOrThrow({ where: { id: f.plan.id } })).stock,
      3,
    );
    assert.equal(await db.order.count({ where: { userId: f.user.id } }), 0);
  } finally {
    await f.cleanup();
  }
});
test("verified webhook settles once without double wallet credit; wrong amounts rejected", async () => {
  const f = await fixture(),
    m = await method("stripe");
  try {
    const o = await checkout(f.user.id, f.cart(m.id));
    assert.equal(await db.instance.count({ where: { userId: f.user.id } }), 0);
    const p = await db.payment.update({
      where: { orderId: o.id },
      data: { providerId: crypto.randomUUID() },
    });
    await assert.rejects(credit(p.id, "stripe", 1001, p.providerId!));
    await Promise.all(
      Array.from({ length: 4 }, () =>
        credit(p.id, "stripe", 1000, p.providerId!),
      ),
    );
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      "PENDING",
    );
    assert.equal(await db.instance.count({ where: { userId: f.user.id } }), 1);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      10000,
    );
    assert.equal(
      await db.ledger.count({ where: { userId: f.user.id, kind: "PURCHASE" } }),
      1,
    );
  } finally {
    await f.cleanup();
    await db.paymentMethod.delete({ where: { id: m.id } });
  }
});
test("cancelled order releases stock once; late payment credits wallet without delivery", async () => {
  const f = await fixture(),
    m = await method("crypto");
  try {
    const o = await checkout(f.user.id, f.cart(m.id));
    await assert.rejects(cancelUnpaid("wrong-user", o.id));
    await cancelUnpaid(f.user.id, o.id);
    await cancelUnpaid(f.user.id, o.id);
    assert.equal(
      (await db.plan.findUniqueOrThrow({ where: { id: f.plan.id } })).stock,
      10,
    );
    const p = await db.payment.update({
      where: { orderId: o.id },
      data: { providerId: crypto.randomUUID() },
    });
    await credit(p.id, "crypto", 1000, p.providerId!);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      11000,
    );
    assert.equal(await db.instance.count({ where: { userId: f.user.id } }), 0);
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      "CANCELLED",
    );
  } finally {
    await f.cleanup();
    await db.paymentMethod.delete({ where: { id: m.id } });
  }
});
test("manual payment confirmation and ready inventory assignment are single use", async () => {
  const f = await fixture(),
    m = await method("manual");
  try {
    const o = await checkout(f.user.id, f.cart(m.id));
    assert.equal(o.status, "AWAITING_PAYMENT");
    await confirmManualPayment("admin", o.id);
    await assert.rejects(confirmManualPayment("admin", o.id));
    const server = await db.inventoryServer.create({
      data: {
        label: "ready",
        planId: f.plan.id,
        ip: "192.0.2.5",
        port: 3389,
        username: "Administrator",
        secret: encrypt("server-secret"),
      },
    });
    const i = await db.instance.findFirstOrThrow({
      where: { userId: f.user.id },
    });
    await fulfill("admin", { id: i.id, inventoryId: server.id });
    assert.equal(
      (await db.inventoryServer.findUniqueOrThrow({ where: { id: server.id } }))
        .state,
      "ASSIGNED",
    );
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      "COMPLETE",
    );
    await assert.rejects(deleteAccount("admin", f.user.id));
  } finally {
    await f.cleanup();
    await db.paymentMethod.delete({ where: { id: m.id } });
  }
});
test("account deletion anonymizes profile and revokes sessions; admin deletion is blocked", async () => {
  const f = await fixture(1, 0);
  try {
    await db.session.create({
      data: {
        id: crypto.randomUUID(),
        userId: f.user.id,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await deleteAccount("admin", f.user.id);
    const u = await db.user.findUniqueOrThrow({ where: { id: f.user.id } });
    assert.ok(u.deletedAt);
    assert.equal(u.disabled, true);
    assert.notEqual(u.email, f.user.email);
    assert.equal(await db.session.count({ where: { userId: f.user.id } }), 0);
    await db.user.update({
      where: { id: f.user.id },
      data: { deletedAt: null, role: "ADMIN" },
    });
    await assert.rejects(deleteAccount("other-admin", f.user.id));
  } finally {
    await f.cleanup();
  }
});
test.after(() => db.$disconnect());
