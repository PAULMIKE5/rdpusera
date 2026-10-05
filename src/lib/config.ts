import { db } from "./db";
import { decrypt, required, HttpError } from "./security";
export const editableKeys = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CRYPTO_API_KEY",
  "CRYPTO_WEBHOOK_SECRET",
  "CRYPTO_CHECKOUT_URL",
] as const;
export async function systemKey(name: (typeof editableKeys)[number]) {
  const row = await db.systemKey.findUnique({ where: { name } });
  return row ? decrypt(row.ciphertext) : required(name);
}
export async function paymentMethod(id: string) {
  if (id === "wallet")
    return {
      id: "wallet",
      provider: "wallet",
      label: "Wallet",
      instructions: "",
      enabled: true,
    };
  const m = await db.paymentMethod.findUnique({ where: { id } });
  if (!m?.enabled) throw new HttpError(409, "Payment method is unavailable");
  return m;
}
export async function keyStatus() {
  const rows = await db.systemKey.findMany({
    select: { name: true, updatedAt: true },
  });
  return editableKeys.map((name) => ({
    name,
    configured: rows.some((r) => r.name === name) || !!process.env[name],
    source: rows.some((r) => r.name === name)
      ? "Admin vault"
      : process.env[name]
        ? "Environment"
        : "Not configured",
  }));
}
