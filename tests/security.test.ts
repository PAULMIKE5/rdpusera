import test from "node:test";
import assert from "node:assert/strict";
import { price, specs } from "../src/lib/domain";
import { encrypt, decrypt, origin, demo } from "../src/lib/security";
process.env.CREDENTIAL_KEY = "ab".repeat(32);
process.env.APP_URL = "https://rdp.example.com";
test("pricing uses integer cents and rejects down-sizing", () => {
  const p = { cpu: 2, ram: 4, disk: 80, baseCents: 2400 };
  assert.equal(price(p, { cpu: 4, ram: 8, disk: 160 }), 4460);
  assert.throws(() => price(p, { cpu: 1, ram: 4, disk: 80 }));
  assert.equal(
    specs.safeParse({
      planId: "p",
      cpu: 33,
      ram: 4,
      disk: 80,
      requestKey: crypto.randomUUID(),
    }).success,
    false,
  );
});
test("credential encryption is randomized and tamper-evident", () => {
  const a = encrypt("a-long-secret-password"),
    b = encrypt("a-long-secret-password");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "a-long-secret-password");
  const broken = Buffer.from(a, "base64");
  broken[15] ^= 1;
  assert.throws(() => decrypt(broken.toString("base64")));
});
test("mutations reject cross-origin and missing origin", () => {
  assert.throws(() => origin(new Request("https://rdp.example.com/api")));
  assert.throws(() =>
    origin(
      new Request("https://rdp.example.com/api", {
        headers: { origin: "https://evil.example" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    origin(
      new Request("https://rdp.example.com/api", {
        headers: { origin: "https://rdp.example.com" },
      }),
    ),
  );
});
test("production refuses demo mode", () => {
  const old = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production", DEMO_MODE: "true" });
  assert.equal(demo(), false);
  Object.assign(process.env, { NODE_ENV: old ?? "test" });
});
