import "dotenv/config";
import test from "node:test";
import {
  registerAccount,
  verifyEmail,
  resendVerification,
  otpHash,
} from "../src/lib/registration";
import { issue } from "../src/lib/security";
import { POST as webhook } from "../src/app/api/webhooks/[provider]/route";
import { checkoutPayment } from "../src/lib/payments";
import { nowSignature } from "../src/lib/gateway-security";
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
      emailVerifiedAt: new Date(),
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
      lines: [
        {
          planId: plan.id,
          cpu: 2,
          ram: 4,
          disk: 80,
          quantity,
          countryCode: "US",
          os: "Windows" as "Windows" | "Ubuntu" | "Linux",
        },
      ],
    }),
    async cleanup() {
      await db.audit.deleteMany({});
      await db.conversation.deleteMany({ where: { userId: user.id } });
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
    m = await method("flutterwave");
  try {
    const o = await checkout(f.user.id, f.cart(m.id));
    assert.equal(await db.instance.count({ where: { userId: f.user.id } }), 0);
    const p = await db.payment.update({
      where: { orderId: o.id },
      data: { providerId: crypto.randomUUID() },
    });
    await assert.rejects(credit(p.id, "flutterwave", 1001, p.providerId!));
    await Promise.all(
      Array.from({ length: 4 }, () =>
        credit(p.id, "flutterwave", 1000, p.providerId!),
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
    m = await method("nowpayments");
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
    await credit(p.id, "nowpayments", 1000, p.providerId!);
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
        countryCode: "US",
        os: "Windows",
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
test("paid orders autoassign ready inventory once; hardware tampering is rejected", async () => {
  const f = await fixture();
  try {
    const server = await db.inventoryServer.create({
      data: {
        planId: f.plan.id,
        countryCode: "US",
        os: "Windows",
        label: "ready",
        ip: "192.0.2.99",
        port: 3389,
        username: "DOMAIN\\user",
        secret: encrypt("password"),
      },
    });
    const o = await checkout(f.user.id, f.cart());
    assert.equal(o.status, "COMPLETE");
    const i = await db.instance.findFirstOrThrow({
      where: { orderItem: { orderId: o.id } },
    });
    assert.equal(i.status, "ACTIVE");
    assert.equal(i.inventoryId, server.id);
    assert.equal(decrypt(i.secret!), "password");
    const second = await checkout(f.user.id, f.cart());
    assert.equal(second.status, "PENDING");
    await db.inventoryServer.create({
      data: {
        planId: f.plan.id,
        countryCode: "US",
        os: "Windows",
        label: "base",
        ip: "192.0.2.98",
        username: "Administrator",
        secret: encrypt("password"),
      },
    });
    const custom = f.cart();
    custom.lines[0].ram = 8;
    await assert.rejects(checkout(f.user.id, custom), /hardware is fixed/);
    assert.equal(
      await db.inventoryServer.count({
        where: { planId: f.plan.id, state: "AVAILABLE" },
      }),
      1,
    );
  } finally {
    await f.cleanup();
  }
});
test("gateway checkout and verified callbacks settle once; invalid signatures and amounts do not settle", async () => {
  const originalFetch = globalThis.fetch;
  process.env.APP_URL = "https://example.invalid";
  process.env.FLUTTERWAVE_SECRET_KEY = "test-key";
  process.env.FLUTTERWAVE_WEBHOOK_SECRET = "test-secret";
  process.env.NOWPAYMENTS_API_KEY = "test-key";
  process.env.NOWPAYMENTS_IPN_SECRET = "test-secret";
  for (const provider of ["flutterwave", "nowpayments"]) {
    const f = await fixture();
    let creations = 0,
      validAmount = false;
    try {
      const p = await db.payment.create({
        data: {
          userId: f.user.id,
          cents: 1000,
          provider,
          requestKey: crypto.randomUUID(),
        },
      });
      globalThis.fetch = async (_url, init) => {
        if (init?.method === "POST") {
          creations++;
          return Response.json(
            provider === "flutterwave"
              ? {
                  status: "success",
                  data: { link: "https://checkout.flutterwave.com/test" },
                }
              : {
                  id: 123,
                  invoice_url: "https://nowpayments.io/payment/?iid=123",
                },
          );
        }
        return Response.json(
          provider === "flutterwave"
            ? {
                status: "success",
                data: {
                  id: 456,
                  tx_ref: p.id,
                  status: "successful",
                  currency: "USD",
                  amount: validAmount ? 10 : 9,
                },
              }
            : {
                payment_id: 456,
                invoice_id: 123,
                order_id: p.id,
                payment_status: "finished",
                price_currency: "usd",
                price_amount: 10,
                actually_paid: validAmount ? "0.1" : "0.09",
                pay_amount: "0.1",
              },
        );
      };
      assert.ok((await checkoutPayment(p.id)).url);
      assert.ok((await checkoutPayment(p.id)).url);
      assert.equal(creations, 1);
      const event =
        provider === "flutterwave"
          ? { event: "charge.completed", data: { id: 456 } }
          : { payment_id: 456 };
      const headers: Record<string, string> =
        provider === "flutterwave"
          ? { "verif-hash": "test-secret" }
          : { "x-nowpayments-sig": nowSignature(event, "test-secret") };
      const request = (signed = true) =>
        new Request(`https://example.invalid/api/webhooks/${provider}`, {
          method: "POST",
          headers: signed ? headers : {},
          body: JSON.stringify(event),
        });
      assert.equal((await webhook(request(false))).status, 401);
      assert.equal((await webhook(request())).status, 400);
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status,
        "PENDING",
      );
      validAmount = true;
      assert.equal((await webhook(request())).status, 200);
      assert.equal((await webhook(request())).status, 200);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
        11000,
      );
      assert.equal(
        await db.ledger.count({
          where: { userId: f.user.id, kind: "FUNDING" },
        }),
        1,
      );
    } finally {
      globalThis.fetch = originalFetch;
      await f.cleanup();
    }
  }
});
test("country and OS selections persist and cannot receive mismatched inventory", async () => {
  const f = await fixture();
  try {
    const server = await db.inventoryServer.create({
      data: {
        planId: f.plan.id,
        countryCode: "US",
        os: "Windows",
        label: "us-windows",
        ip: "192.0.2.81",
        username: "Administrator",
        secret: encrypt("password"),
      },
    });
    const c = f.cart();
    c.lines[0].countryCode = "CA";
    c.lines[0].os = "Ubuntu";
    const order = await checkout(f.user.id, c);
    assert.equal(order.status, "PENDING");
    const i = await db.instance.findFirstOrThrow({
      where: { userId: f.user.id },
    });
    assert.equal(i.countryCode, "CA");
    assert.equal(i.location, "Canada");
    assert.equal(i.os, "Ubuntu");
    await assert.rejects(
      fulfill("admin", { id: i.id, inventoryId: server.id }),
    );
    assert.equal(
      (await db.inventoryServer.findUniqueOrThrow({ where: { id: server.id } }))
        .state,
      "AVAILABLE",
    );
  } finally {
    await f.cleanup();
  }
});
test("registration requires email OTP, rejects guesses, limits resend, and consumes a code once", async () => {
  const original = globalThis.fetch;
  let emailedCode = "";
  process.env.JWT_SECRET = "test-only-jwt-secret-with-at-least-32-characters";
  process.env.RESEND_API_KEY = "test-only-key";
  process.env.EMAIL_FROM = "hello@example.invalid";
  const email = `${crypto.randomUUID()}@example.invalid`;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    emailedCode = payload.text.match(/code is (\d{6})/)[1];
    return Response.json({ id: "test-email" });
  };
  try {
    const c = await registerAccount({
      name: "Test Customer",
      countryCode: "NG",
      email,
      password: "a-password-long-enough",
    });
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    assert.equal(u.emailVerifiedAt, null);
    assert.equal(u.emailVerificationRequired, true);
    assert.equal(await db.session.count({ where: { userId: u.id } }), 0);
    await assert.rejects(issue(u.id), /Verify your email/);
    const record = await db.emailVerification.findUniqueOrThrow({
      where: { id: c.challengeId },
    });
    assert.notEqual(record.codeHash, emailedCode);
    assert.equal(record.codeHash, otpHash(c.challengeId, emailedCode));
    await assert.rejects(
      resendVerification(c.challengeId),
      /Too many requests/,
    );
    const wrong = emailedCode === "000000" ? "111111" : "000000";
    await assert.rejects(
      verifyEmail({ challengeId: c.challengeId, code: wrong }),
    );
    assert.equal(
      (
        await db.emailVerification.findUniqueOrThrow({
          where: { id: c.challengeId },
        })
      ).attempts,
      1,
    );
    assert.equal(
      await verifyEmail({ challengeId: c.challengeId, code: emailedCode }),
      u.id,
    );
    assert.ok(
      (await db.user.findUniqueOrThrow({ where: { id: u.id } }))
        .emailVerifiedAt,
    );
    await assert.rejects(
      verifyEmail({ challengeId: c.challengeId, code: emailedCode }),
    );
  } finally {
    globalThis.fetch = original;
    await db.user.deleteMany({ where: { email } });
  }
});
test("OTP attempt exhaustion, expiry and resend invalidate older codes", async () => {
  const original = globalThis.fetch;
  let code = "";
  const email = `${crypto.randomUUID()}@example.invalid`;
  globalThis.fetch = async (_url, init) => {
    code = JSON.parse(String(init?.body)).text.match(/code is (\d{6})/)[1];
    return Response.json({ id: "test-email" });
  };
  try {
    const c = await registerAccount({
      name: "Test Customer",
      countryCode: "NG",
      email,
      password: "another-long-password",
    });
    for (let n = 0; n < 5; n++)
      await assert.rejects(
        verifyEmail({
          challengeId: c.challengeId,
          code: code === "000000" ? "111111" : "000000",
        }),
      );
    await assert.rejects(verifyEmail({ challengeId: c.challengeId, code }));
    assert.equal(
      (
        await db.emailVerification.findUniqueOrThrow({
          where: { id: c.challengeId },
        })
      ).attempts,
      5,
    );
    await db.rateLimit.deleteMany({}); // Dedicated test database only: advance the resend test window.
    const newer = await resendVerification(c.challengeId);
    await assert.rejects(verifyEmail({ challengeId: c.challengeId, code }));
    await db.emailVerification.update({
      where: { id: newer.challengeId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await assert.rejects(verifyEmail({ challengeId: newer.challengeId, code }));
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt,
      null,
    );
  } finally {
    globalThis.fetch = original;
    await db.user.deleteMany({ where: { email } });
  }
});
test("email delivery failure never activates the account or returns a code", async () => {
  const original = globalThis.fetch,
    email = `${crypto.randomUUID()}@example.invalid`;
  globalThis.fetch = async () =>
    Response.json({ error: "mail unavailable" }, { status: 503 });
  try {
    await assert.rejects(
      registerAccount({
        name: "Test Customer",
        countryCode: "NG",
        email,
        password: "another-long-password",
      }),
      /could not send/,
    );
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    assert.equal(u.emailVerifiedAt, null);
    assert.equal(
      await db.emailVerification.count({ where: { userId: u.id } }),
      0,
    );
    assert.equal(await db.session.count({ where: { userId: u.id } }), 0);
  } finally {
    globalThis.fetch = original;
    await db.user.deleteMany({ where: { email } });
  }
});
test.after(() => db.$disconnect());

import { adminOperation, assignServer } from "../src/lib/admin-operations";
import { sendChat, chatUser } from "../src/lib/chat";
import {
  verifyNowPayment,
  reconcilePayment,
} from "../src/lib/payment-verification";
const adminPassword = "not-checked-in-service-layer";
test("admin balance updates are idempotent, audited and reject stale wallet writes", async () => {
  const f = await fixture();
  try {
    const action = {
      action: "balance" as const,
      id: f.user.id,
      expectedWallet: 10000,
      wallet: 12000,
      reason: "Support account credit",
      requestKey: crypto.randomUUID(),
      password: adminPassword,
    };
    await adminOperation("test-admin", action);
    await adminOperation("test-admin", action);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      12000,
    );
    assert.equal(
      await db.ledger.count({
        where: { userId: f.user.id, kind: "ADMIN_ADJUSTMENT" },
      }),
      1,
    );
    await assert.rejects(
      adminOperation("test-admin", {
        ...action,
        requestKey: crypto.randomUUID(),
        wallet: 15000,
      }),
      /Balance changed/,
    );
    assert.equal(
      await db.audit.count({
        where: { action: "ADMIN_balance", targetId: f.user.id },
      }),
      1,
    );
  } finally {
    await f.cleanup();
  }
});
test("manual transaction correction posts only a delta and deletion never changes money", async () => {
  const f = await fixture();
  try {
    await adminOperation("test-admin", {
      action: "transactionCreate",
      userId: f.user.id,
      cents: 500,
      notes: "Goodwill credit",
      requestKey: crypto.randomUUID(),
      password: adminPassword,
    });
    const p = await db.payment.findFirstOrThrow({
      where: { userId: f.user.id },
    });
    const edit = {
      action: "transactionEdit" as const,
      id: p.id,
      cents: 300,
      notes: "Correct amount",
      version: 0,
      password: adminPassword,
    };
    await adminOperation("test-admin", edit);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      10300,
    );
    await assert.rejects(
      adminOperation("test-admin", edit),
      /Transaction changed/,
    );
    await adminOperation("test-admin", {
      action: "transactionDelete",
      id: p.id,
      reason: "Remove from current view",
      password: adminPassword,
    });
    assert.ok(
      (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).deletedAt,
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      10300,
    );
    await adminOperation("test-admin", {
      action: "transactionRestore",
      id: p.id,
      reason: "Restore record",
      password: adminPassword,
    });
    assert.equal(
      (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).deletedAt,
      null,
    );
    await assert.rejects(
      adminOperation("test-admin", {
        action: "transactionCreate",
        userId: f.user.id,
        cents: -20000,
        notes: "Excessive debit",
        requestKey: crypto.randomUUID(),
        password: adminPassword,
      }),
    );
    const p2 = await db.payment.create({
      data: {
        userId: f.user.id,
        cents: 100,
        provider: "flutterwave",
        status: "PAID",
        requestKey: crypto.randomUUID(),
      },
    });
    await assert.rejects(
      adminOperation("test-admin", { ...edit, id: p2.id, cents: 500 }),
      /Provider payment amounts are fixed/,
    );
  } finally {
    await f.cleanup();
  }
});
test("order deletion cancels unpaid stock once and preserves late-payment reconciliation", async () => {
  const f = await fixture();
  const m = await method("flutterwave");
  try {
    const o = await checkout(f.user.id, f.cart(m.id));
    const p = await db.payment.findUniqueOrThrow({ where: { orderId: o.id } });
    await db.payment.update({
      where: { id: p.id },
      data: { providerId: p.id },
    });
    const action = {
      action: "orderDelete" as const,
      id: o.id,
      reason: "Customer cancelled order",
      password: adminPassword,
    };
    await adminOperation("test-admin", action);
    await adminOperation("test-admin", action);
    assert.equal(
      (await db.plan.findUniqueOrThrow({ where: { id: f.plan.id } })).stock,
      10,
    );
    await credit(p.id, "flutterwave", 1000, p.id, "flutterwave:test-archive");
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      11000,
    );
    assert.equal(await db.instance.count({ where: { userId: f.user.id } }), 0);
    await adminOperation("test-admin", { ...action, action: "orderRestore" });
    const restored = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.equal(restored.status, "CANCELLED");
    assert.equal(restored.deletedAt, null);
  } finally {
    await f.cleanup();
    await db.paymentMethod.delete({ where: { id: m.id } });
  }
});
test("pending payments cannot be hidden and undelivered paid orders cannot be deleted", async () => {
  const f = await fixture();
  try {
    const p = await db.payment.create({
      data: {
        userId: f.user.id,
        cents: 100,
        provider: "nowpayments",
        requestKey: crypto.randomUUID(),
      },
    });
    await assert.rejects(
      adminOperation("test-admin", {
        action: "transactionDelete",
        id: p.id,
        reason: "Attempt deletion",
        password: adminPassword,
      }),
      /Reconcile/,
    );
    const o = await checkout(f.user.id, f.cart());
    await assert.rejects(
      adminOperation("test-admin", {
        action: "orderDelete",
        id: o.id,
        reason: "Attempt deletion",
        password: adminPassword,
      }),
      /Deliver or resolve/,
    );
  } finally {
    await f.cleanup();
  }
});
test("direct assignment claims inventory once, uses encrypted credentials, and sends a safe notification", async () => {
  const f = await fixture();
  try {
    const inventory = await db.inventoryServer.create({
      data: {
        planId: f.plan.id,
        label: "Ready",
        countryCode: "US",
        os: "Windows",
        ip: "192.0.2.123",
        port: 3389,
        username: "Administrator",
        secret: encrypt("private-server-password"),
      },
    });
    const data = {
      userId: f.user.id,
      planId: f.plan.id,
      inventoryId: inventory.id,
      countryCode: "US",
      os: "Windows" as const,
      days: 30,
      reason: "Complimentary server",
      requestKey: crypto.randomUUID(),
      password: adminPassword,
    };
    const instance = await assignServer("test-admin", data);
    assert.equal((await assignServer("test-admin", data)).id, instance.id);
    assert.equal(decrypt(instance.secret!), "private-server-password");
    assert.equal(instance.priceCents, 0);
    assert.equal(
      (await db.plan.findUniqueOrThrow({ where: { id: f.plan.id } })).stock,
      9,
    );
    const messages = await db.chatMessage.findMany({
      where: { conversation: { userId: f.user.id } },
    });
    assert.equal(messages.length, 1);
    assert.ok(!messages[0].body.includes("private-server-password"));
    await assert.rejects(
      assignServer("test-admin", { ...data, requestKey: crypto.randomUUID() }),
      /Inventory must/,
    );
    await assert.rejects(
      assignServer("test-admin", { ...data, countryCode: "NG" }),
      /Assignment key already used/,
    );
  } finally {
    await f.cleanup();
  }
});
test("support conversations enforce ownership and prevent duplicate or retargeted messages", async () => {
  const f = await fixture(),
    other = await fixture();
  try {
    const actor = { id: f.user.id, role: "USER" },
      requestKey = crypto.randomUUID();
    await assert.rejects(chatUser(actor, other.user.id), /Access denied/);
    await assert.rejects(
      sendChat(actor, { userId: other.user.id, body: "Intrusion", requestKey }),
      /Access denied/,
    );
    const first = await sendChat(actor, {
      body: "Help with my server",
      requestKey,
    });
    assert.equal(
      (await sendChat(actor, { body: "Help with my server", requestKey })).id,
      first.id,
    );
    await assert.rejects(
      sendChat(actor, { body: "Different message", requestKey }),
      /Message key already used/,
    );
    const reply = await sendChat(
      { id: "test-admin", role: "ADMIN" },
      {
        userId: f.user.id,
        body: "I can help.",
        requestKey: crypto.randomUUID(),
      },
    );
    assert.equal(reply.conversationId, first.conversationId);
    assert.equal(
      await db.conversation.count({ where: { userId: other.user.id } }),
      0,
    );
  } finally {
    await f.cleanup();
    await other.cleanup();
  }
});
test("crypto early callbacks retain IDs, return verification settles once and rejects another user's payment", async () => {
  const f = await fixture(),
    other = await fixture();
  const original = globalThis.fetch;
  process.env.NOWPAYMENTS_API_KEY = "test-only-key";
  try {
    const p = await db.payment.create({
      data: {
        userId: f.user.id,
        cents: 1000,
        provider: "nowpayments",
        providerId: "900",
        checkoutStarted: true,
        requestKey: crypto.randomUUID(),
      },
    });
    let status = "confirming";
    globalThis.fetch = async () =>
      Response.json({
        payment_id: 123,
        invoice_id: 900,
        order_id: p.id,
        price_currency: "usd",
        price_amount: 10,
        payment_status: status,
        actually_paid: "0.001",
        pay_amount: "0.001",
      });
    await verifyNowPayment("123");
    assert.equal(
      (await db.payment.findUniqueOrThrow({ where: { id: p.id } }))
        .gatewayPaymentId,
      "123",
    );
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      10000,
    );
    await assert.rejects(
      reconcilePayment(other.user.id, p.id),
      /Payment not found/,
    );
    status = "finished";
    assert.equal((await reconcilePayment(f.user.id, p.id)).status, "PAID");
    await reconcilePayment(f.user.id, p.id);
    await verifyNowPayment("123");
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      11000,
    );
    const unrelated = await db.payment.create({
      data: {
        userId: other.user.id,
        cents: 1000,
        provider: "nowpayments",
        providerId: "901",
        checkoutStarted: true,
        requestKey: crypto.randomUUID(),
      },
    });
    await assert.rejects(
      reconcilePayment(other.user.id, unrelated.id, "123"),
      /mismatch/,
    );
  } finally {
    globalThis.fetch = original;
    await f.cleanup();
    await other.cleanup();
  }
});

test("separate Flutterwave currencies lock amounts, reject mismatch and settle order/funding once", async () => {
  const { createFundingPayment } = await import("../src/lib/payments");
  const { verifyFlutterwavePayment } =
    await import("../src/lib/payment-verification");
  const f = await fixture();
  const ngn = await db.paymentMethod.create({
    data: {
      label: "Naira",
      provider: "flutterwave_ngn",
      enabled: true,
      usdToNgn: "1500.123456",
    },
  });
  const usd = await method("flutterwave");
  const originalFetch = globalThis.fetch;
  process.env.APP_URL = "https://example.invalid";
  process.env.FLUTTERWAVE_SECRET_KEY = "test-key";
  process.env.FLUTTERWAVE_WEBHOOK_SECRET = "test-secret";
  try {
    const o = await checkout(f.user.id, f.cart(ngn.id));
    const p = await db.payment.findUniqueOrThrow({ where: { orderId: o.id } });
    assert.equal(p.chargeCurrency, "NGN");
    assert.equal(p.chargeAmount?.toFixed(2), "15001.23");
    await db.paymentMethod.update({
      where: { id: ngn.id },
      data: { usdToNgn: "2000" },
    });
    let currency = "USD",
      amount = "15001.23",
      creations = 0;
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "POST") {
        creations++;
        const body = JSON.parse(String(init.body));
        assert.equal(body.currency, "NGN");
        assert.equal(body.amount, "15001.23");
        assert.equal(body.payment_options, "card, banktransfer, ussd");
        return Response.json({
          status: "success",
          data: { link: "https://checkout.flutterwave.com/test-ngn" },
        });
      }
      return Response.json({
        status: "success",
        data: {
          id: 654321,
          tx_ref: p.id,
          status: "successful",
          currency,
          amount,
        },
      });
    };
    await checkoutPayment(p.id);
    await checkoutPayment(p.id);
    assert.equal(creations, 1);
    await assert.rejects(verifyFlutterwavePayment("654321", p.id), /mismatch/);
    currency = "NGN";
    amount = "10";
    await assert.rejects(verifyFlutterwavePayment("654321", p.id), /mismatch/);
    amount = "15001.22";
    await assert.rejects(verifyFlutterwavePayment("654321", p.id), /mismatch/);
    amount = "15001.23";
    await assert.rejects(
      verifyFlutterwavePayment("654321", "wrong-payment"),
      /mismatch/,
    );
    const callback = () =>
      new Request("https://example.invalid/api/webhooks/flutterwave", {
        method: "POST",
        headers: { "verif-hash": "test-secret" },
        body: JSON.stringify({
          event: "charge.completed",
          data: { id: 654321 },
        }),
      });
    assert.equal((await webhook(callback())).status, 200);
    assert.equal((await webhook(callback())).status, 200);
    assert.equal(
      (await db.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      "PENDING",
    );
    assert.equal(await db.instance.count({ where: { userId: f.user.id } }), 1);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      10000,
    );

    const input = {
      cents: 1250,
      provider: "flutterwave_ngn",
      method: ngn.id,
      requestKey: crypto.randomUUID(),
    };
    const funding = await createFundingPayment(f.user.id, input);
    assert.equal(funding.chargeAmount?.toFixed(2), "25000.00");
    await db.paymentMethod.update({
      where: { id: ngn.id },
      data: { usdToNgn: "2500" },
    });
    assert.equal(
      (await createFundingPayment(f.user.id, input)).chargeAmount?.toFixed(2),
      "25000.00",
    );
    await assert.rejects(
      createFundingPayment(f.user.id, { ...input, cents: 1300 }),
      /Idempotency/,
    );
    await assert.rejects(
      createFundingPayment(f.user.id, { ...input, method: usd.id }),
      /disabled/,
    );
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "POST") {
        assert.equal(JSON.parse(String(init.body)).amount, "25000.00");
        return Response.json({
          status: "success",
          data: { link: "https://checkout.flutterwave.com/fund" },
        });
      }
      return Response.json({
        status: "success",
        data: {
          id: 654322,
          tx_ref: funding.id,
          status: "successful",
          currency: "NGN",
          amount: "25000",
        },
      });
    };
    await checkoutPayment(funding.id);
    await verifyFlutterwavePayment("654322", funding.id);
    await verifyFlutterwavePayment("654322", funding.id);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).wallet,
      11250,
    );
    assert.equal(
      await db.ledger.count({ where: { reference: `payment:${funding.id}` } }),
      1,
    );

    const dollar = await createFundingPayment(f.user.id, {
      cents: 1000,
      provider: "flutterwave",
      method: usd.id,
      requestKey: crypto.randomUUID(),
    });
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        assert.equal(body.currency, "USD");
        assert.equal(body.amount, "10.00");
        assert.equal(body.payment_options, "card");
        return Response.json({
          status: "success",
          data: { link: "https://checkout.flutterwave.com/usd" },
        });
      }
      return Response.json({
        status: "success",
        data: {
          id: 654323,
          tx_ref: dollar.id,
          status: "successful",
          currency: "NGN",
          amount: "10",
        },
      });
    };
    await checkoutPayment(dollar.id);
    await assert.rejects(
      verifyFlutterwavePayment("654323", dollar.id),
      /mismatch/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await f.cleanup();
    await db.paymentMethod.deleteMany({
      where: { id: { in: [ngn.id, usd.id] } },
    });
  }
});
