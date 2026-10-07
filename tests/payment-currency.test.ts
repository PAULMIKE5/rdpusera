import test from "node:test";
import assert from "node:assert/strict";
import {
  exchangeRateInput,
  ngnAmount,
  paymentQuote,
} from "../src/lib/payment-currency";
test("NGN converts USD cents with exact half-up kobo rounding", () => {
  assert.equal(ngnAmount(1000, "1500"), "15000.00");
  assert.equal(ngnAmount(10, "1500.123456"), "150.01");
  assert.equal(ngnAmount(1, "1.5"), "0.02");
  assert.equal(ngnAmount(100000, "100000"), "100000000.00");
  assert.throws(() => ngnAmount(1, "0.000001"), /out of range/);
});
test("NGN rate must be explicit, positive and bounded without exponent notation", () => {
  for (const value of [
    "",
    "0",
    "-1500",
    "NaN",
    "Infinity",
    "1e3",
    "100001",
    "1.1234567",
  ])
    assert.equal(exchangeRateInput.safeParse(value).success, false);
  assert.throws(() => paymentQuote("flutterwave_ngn", 1000));
  assert.deepEqual(paymentQuote("flutterwave", 10), {
    chargeCurrency: "USD",
    chargeAmount: "0.10",
    exchangeRate: null,
  });
});
