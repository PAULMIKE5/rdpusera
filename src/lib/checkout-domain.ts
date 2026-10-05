import { z } from "zod";
import { countries, checkoutSystems } from "./countries";
export const countryInput = z
  .string()
  .refine(
    (v) => countries.some((c) => c.code === v),
    "Select a country from the list",
  );
import { createHash } from "node:crypto";
export const cartLine = z.object({
  planId: z.string().min(1).max(100),
  cpu: z.number().int().min(1).max(32).optional(),
  ram: z.number().int().min(1).max(128).optional(),
  disk: z.number().int().min(20).max(2000).optional(),
  countryCode: countryInput,
  os: z.enum(checkoutSystems),
  quantity: z.number().int().min(1).max(10),
});
export const checkoutInput = z
  .object({
    requestKey: z.string().uuid(),
    method: z.string().min(1).max(100),
    lines: z.array(cartLine).min(1).max(20),
  })
  .refine(
    (s) => s.lines.reduce((n, l) => n + l.quantity, 0) <= 20,
    "Maximum 20 servers per order",
  );
export function fingerprint(s: z.infer<typeof checkoutInput>) {
  const lines = s.lines
    .map((l) => ({
      planId: l.planId,
      cpu: l.cpu,
      ram: l.ram,
      disk: l.disk,
      quantity: l.quantity,
      countryCode: l.countryCode,
      os: l.os,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256")
    .update(JSON.stringify({ method: s.method, lines }))
    .digest("hex");
}
export const connectionInput = z.object({
  id: z.string(),
  ip: z
    .string()
    .trim()
    .ip("Enter an IPv4 or IPv6 address only; enter the port separately."),
  port: z.number().int().min(1).max(65535),
  username: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(
      /^[a-zA-Z0-9._@\\ -]+$/,
      "Use a valid server username, such as Administrator or DOMAIN\\user.",
    ),
  password: z.string().min(1).max(512),
});

export const deliveryInput = z.union([
  connectionInput,
  z.object({ id: z.string(), inventoryId: z.string().min(1) }),
]);
