import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
if (
  process.env.RUN_DB_TESTS !== "true" ||
  new URL(process.env.DATABASE_URL ?? "http://invalid").pathname !==
    "/globalrdp_test"
)
  throw Error("Use a dedicated globalrdp_test database");
const base = "http://127.0.0.1:3107",
  password = "test-only-administrator-password";
const environment = {
  ...process.env,
  NODE_ENV: "production" as const,
  APP_URL: base,
  JWT_SECRET: randomBytes(32).toString("hex"),
  CREDENTIAL_KEY: randomBytes(32).toString("hex"),
};
let app: ChildProcess | undefined;
async function start() {
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-p",
      "3107",
      "-H",
      "127.0.0.1",
    ],
    { env: environment, stdio: ["ignore", "ignore", "inherit"] },
  );
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + "/login")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Test app did not start");
}
async function stop() {
  if (app && app.exitCode === null) {
    const exited = new Promise<void>((r) => app!.once("exit", () => r()));
    app.kill("SIGTERM");
    await exited;
  }
}
async function request(
  path: string,
  cookie = "",
  data?: unknown,
  origin = base,
) {
  return fetch(base + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      cookie,
      ...(data !== undefined
        ? { "Content-Type": "application/json", origin }
        : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    redirect: "manual",
  });
}
test(
  "HTTP sessions survive refresh and process restart; admin, CSRF and chat ownership gates hold",
  { timeout: 40000 },
  async () => {
    const hash = await bcrypt.hash(password, 12),
      tag = randomBytes(8).toString("hex");
    const admin = await db.user.create({
      data: {
        email: `admin-${tag}@test.invalid`,
        password: hash,
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
    });
    const customer = await db.user.create({
      data: {
        email: `customer-${tag}@test.invalid`,
        password: hash,
        emailVerifiedAt: new Date(),
      },
    });
    try {
      await db.$disconnect();
      await start();
      assert.equal((await request("/api/admin")).status, 401);
      const login = await request("/api/auth/login", "", {
        email: admin.email,
        password,
      });
      assert.equal(login.status, 200);
      const setCookie = login.headers.get("set-cookie")!;
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /Secure/i);
      assert.match(setCookie, /SameSite=lax/i);
      const adminCookie = setCookie.split(";")[0];
      const customerLogin = await request("/api/auth/login", "", {
        email: customer.email,
        password,
      });
      assert.equal(customerLogin.status, 200);
      const userCookie = customerLogin.headers.get("set-cookie")!.split(";")[0];
      for (let n = 0; n < 3; n++) {
        assert.equal((await request("/admin", adminCookie)).status, 200);
        assert.equal(
          (await (await request("/api/me", adminCookie)).json()).role,
          "ADMIN",
        );
      }
      const report = await request("/api/admin", adminCookie);
      assert.equal(report.status, 200);
      const data = await report.json();
      assert.equal(typeof data.revenue, "number");
      assert.ok(data.users.every((u: Record<string, unknown>) => !u.password));
      assert.equal((await request("/api/admin", userCookie)).status, 403);
      assert.equal(
        (
          await request(
            "/api/admin",
            adminCookie,
            { action: "balance" },
            "https://other.invalid",
          )
        ).status,
        403,
      );
      const balance = {
        action: "balance",
        id: customer.id,
        wallet: 100,
        expectedWallet: 0,
        reason: "Test adjustment",
        requestKey: crypto.randomUUID(),
        password: "wrong",
      };
      assert.equal(
        (await request("/api/admin", adminCookie, balance)).status,
        403,
      );
      assert.equal(
        (await request("/api/admin", adminCookie, { ...balance, password }))
          .status,
        200,
      );
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: customer.id } }))
          .wallet,
        100,
      );
      const chat = await request("/api/chat", adminCookie, {
        userId: customer.id,
        body: "Your server is ready",
        requestKey: crypto.randomUUID(),
      });
      assert.equal(chat.status, 200);
      const messages = await (await request("/api/chat", userCookie)).json();
      assert.equal(messages.messages[0].body, "Your server is ready");
      assert.equal(
        (await request(`/api/chat?userId=${admin.id}`, userCookie)).status,
        403,
      );
      assert.equal(
        (
          await request("/api/auth/register", "", {
            email: `missing-${tag}@test.invalid`,
            password,
          })
        ).status,
        400,
      );
      assert.equal(
        (await request("/payments/return?payment=unknown")).status,
        200,
      );
      await stop();
      await start();
      assert.equal((await request("/admin", adminCookie)).status, 200);
      assert.equal(
        (await (await request("/api/me", adminCookie)).json()).id,
        admin.id,
      );
      assert.equal(
        (await request("/api/auth/logout", adminCookie, {})).status,
        200,
      );
      assert.equal((await request("/api/me", adminCookie)).status, 401);
    } finally {
      await stop();
      await db.conversation.deleteMany({
        where: { userId: { in: [admin.id, customer.id] } },
      });
      await db.audit.deleteMany({ where: { actorId: admin.id } });
      await db.ledger.deleteMany({ where: { userId: customer.id } });
      await db.payment.deleteMany({ where: { userId: customer.id } });
      await db.user.deleteMany({
        where: { id: { in: [admin.id, customer.id] } },
      });
      await db.$disconnect();
    }
  },
);
