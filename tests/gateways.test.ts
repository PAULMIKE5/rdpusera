import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { countries, operatingSystems } from "../src/lib/countries";
import { connectionInput } from "../src/lib/checkout-domain";
import {
  equalSignature,
  nowSignature,
  fiatCents,
  fullyPaid,
} from "../src/lib/gateway-security";
test("Windows domain usernames and trimmed addresses are accepted; ports and injected newlines rejected", () => {
  const base = {
    id: "i",
    ip: " 192.0.2.1 ",
    port: 3389,
    username: "DOMAIN\\user",
    password: "secret",
  };
  assert.equal(connectionInput.parse(base).ip, "192.0.2.1");
  assert.ok(
    connectionInput.safeParse({ ...base, username: ".\\Administrator" })
      .success,
  );
  assert.ok(
    !connectionInput.safeParse({ ...base, username: "user\nadmin" }).success,
  );
  assert.ok(!connectionInput.safeParse({ ...base, port: 65536 }).success);
  assert.ok(
    !connectionInput.safeParse({ ...base, ip: "192.0.2.1:3389" }).success,
  );
});
test("country catalog has 100 unique codes and Windows is first", () => {
  assert.equal(countries.length, 100);
  assert.equal(new Set(countries.map((c) => c.code)).size, 100);
  assert.equal(operatingSystems[0], "Windows");
});
test("NOWPayments uses recursively sorted JSON HMAC and rejects tampering", () => {
  const payload = { z: 2, a: { z: 1, a: 3 } };
  const expected = createHmac("sha512", "test")
    .update('{"a":{"a":3,"z":1},"z":2}')
    .digest("hex");
  assert.equal(nowSignature(payload, "test"), expected);
  assert.ok(equalSignature(expected, nowSignature(payload, "test")));
  assert.ok(
    !equalSignature(expected, nowSignature({ ...payload, z: 4 }, "test")),
  );
  assert.ok(!equalSignature(expected, ""));
});
test("monetary checks preserve cents and reject crypto underpayment", () => {
  assert.equal(fiatCents("24.01"), 2401);
  assert.equal(fiatCents(24), 2400);
  assert.throws(() => fiatCents("24.001"));
  assert.throws(() => fiatCents(-1));
  assert.ok(fullyPaid("0.000000000000000002", "0.000000000000000001"));
  assert.ok(!fullyPaid("0.099999999999999999", "0.1"));
  assert.ok(fullyPaid(1e-8, "0.00000001"));
  assert.ok(!fullyPaid(9e-9, "0.00000001"));
  assert.ok(!fullyPaid("0", "0"));
  assert.ok(!fullyPaid("not money", "1"));
});

import { dollarsToCents, paymentCents } from "../src/lib/money";
test("decimal payments preserve ten-cent minimum precision", () => {
  assert.equal(dollarsToCents("0.10"), 10);
  assert.ok(paymentCents.safeParse(10).success);
  assert.ok(!paymentCents.safeParse(9).success);
  assert.ok(!paymentCents.safeParse(10.5).success);
  assert.equal(dollarsToCents("0.29"), 29);
  assert.equal(dollarsToCents("1.01"), 101);
  assert.throws(() => dollarsToCents("0.101"));
  assert.throws(() => dollarsToCents("-0.10"));
  assert.throws(() => dollarsToCents("NaN"));
});
