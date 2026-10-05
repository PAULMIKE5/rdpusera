import { z } from "zod";
// Accept decimal dollar input, store exact integer cents. No binary floating-point accounting.
export function dollarsToCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter an amount with at most two decimal places");
  const [d, c = ""] = value.trim().split(".");
  const amount = Number(d) * 100 + Number(c.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) throw new Error("Invalid amount");
  return amount;
}
export const MIN_PAYMENT_CENTS = 10;

export const paymentCents = z.number().int().min(MIN_PAYMENT_CENTS).max(100000);
