import { createHmac, timingSafeEqual } from "node:crypto";
export function equalSignature(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sorted(v)]),
    );
  return value;
}
export function nowSignature(value: unknown, secret: string) {
  return createHmac("sha512", secret)
    .update(JSON.stringify(sorted(value)))
    .digest("hex");
}
export function fiatCents(value: unknown) {
  const s = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Invalid monetary amount");
  const [whole, fraction = ""] = s.split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n)) throw new Error("Invalid monetary amount");
  return n;
}
export function fullyPaid(actual: unknown, expected: unknown) {
  const decimal = (v: unknown) => {
    const m = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(v));
    if (!m) return null;
    const fraction = m[2] || "",
      exponent = Number(m[3] || 0);
    const scale = 30 + exponent - fraction.length;
    if (!Number.isInteger(scale) || scale < 0 || scale > 60) return null;
    return BigInt(m[1] + fraction) * 10n ** BigInt(scale);
  };
  const a = decimal(actual),
    e = decimal(expected);
  return a !== null && e !== null && e > 0n && a >= e;
}
