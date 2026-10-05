import test from "node:test";
import assert from "node:assert/strict";
import {
  checkoutInput,
  fingerprint,
  deliveryInput,
} from "../src/lib/checkout-domain";
const line = { planId: "test", cpu: 2, ram: 4, disk: 80, quantity: 1 };
test("cart validates quantities and total units", () => {
  const s = {
    requestKey: crypto.randomUUID(),
    method: "wallet",
    lines: [line],
  };
  assert.equal(checkoutInput.safeParse(s).success, true);
  assert.equal(
    checkoutInput.safeParse({ ...s, lines: [{ ...line, quantity: 0 }] })
      .success,
    false,
  );
  assert.equal(
    checkoutInput.safeParse({
      ...s,
      lines: Array(3).fill({ ...line, quantity: 10 }),
    }).success,
    false,
  );
});
test("cart fingerprints ignore row ordering but detect quantity and method changes", () => {
  const a = {
    requestKey: crypto.randomUUID(),
    method: "wallet",
    lines: [line, { ...line, planId: "other" }],
  };
  assert.equal(
    fingerprint(a),
    fingerprint({ ...a, lines: [...a.lines].reverse() }),
  );
  assert.notEqual(fingerprint(a), fingerprint({ ...a, method: "stripe" }));
  assert.notEqual(
    fingerprint(a),
    fingerprint({ ...a, lines: [{ ...line, quantity: 2 }] }),
  );
});
test("delivery accepts validated connection or an inventory assignment", () => {
  assert.equal(
    deliveryInput.safeParse({ id: "i", inventoryId: "s" }).success,
    true,
  );
  assert.equal(
    deliveryInput.safeParse({
      id: "i",
      ip: "192.0.2.1",
      port: 3389,
      username: "Admin",
      password: "secret",
    }).success,
    true,
  );
  assert.equal(
    deliveryInput.safeParse({
      id: "i",
      ip: "evil\r\nfull address:s:other",
      port: 3389,
      username: "Admin",
      password: "secret",
    }).success,
    false,
  );
  assert.equal(
    deliveryInput.safeParse({
      id: "i",
      ip: "192.0.2.1",
      port: 70000,
      username: "Admin",
      password: "secret",
    }).success,
    false,
  );
});
