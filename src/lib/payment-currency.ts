import { z } from "zod";
// Fixed-point, six-decimal NGN-per-USD rate. Never use floats for settlement.
export const exchangeRateInput = z
  .string()
  .trim()
  .regex(
    /^\d{1,6}(?:\.\d{1,6})?$/,
    "Enter NGN per $1, with up to six decimal places",
  )
  .refine(
    (v) => Number(v) > 0 && Number(v) <= 100000,
    "Rate must be greater than zero and at most 100000",
  );
export function isFlutterwave(provider: string) {
  return provider === "flutterwave" || provider === "flutterwave_ngn";
}
export function ngnAmount(usdCents: number, rate: string): string {
  const parsed = exchangeRateInput.parse(rate);
  if (!Number.isSafeInteger(usdCents) || usdCents <= 0)
    throw Error("Invalid USD amount");
  const [whole, fraction = ""] = parsed.split(".");
  const scaled = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  const kobo = (BigInt(usdCents) * scaled + 500000n) / 1000000n;
  if (kobo < 1n || kobo > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("Converted amount is out of range");
  return `${kobo / 100n}.${String(kobo % 100n).padStart(2, "0")}`;
}
export function paymentQuote(
  provider: string,
  cents: number,
  rate?: string | null,
) {
  if (provider === "flutterwave_ngn") {
    if (!rate)
      throw Error(
        "Set the NGN exchange rate before enabling this payment method",
      );
    return {
      chargeCurrency: "NGN",
      chargeAmount: ngnAmount(cents, rate),
      exchangeRate: rate,
    };
  }
  return {
    chargeCurrency: "USD",
    chargeAmount: (cents / 100).toFixed(2),
    exchangeRate: null,
  };
}
export function paymentLabel(provider: string) {
  if (provider === "flutterwave_ngn")
    return "Naira · Bank transfer, card & USSD";
  if (provider === "flutterwave") return "USD · Cards";
  return provider;
}
