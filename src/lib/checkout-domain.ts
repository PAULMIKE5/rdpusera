import { z } from "zod";
import { createHash } from "node:crypto";
export const cartLine = z.object({
  planId: z.string().min(1).max(100),
  cpu: z.number().int().min(1).max(32),
  ram: z.number().int().min(1).max(128),
  disk: z.number().int().min(20).max(2000),
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
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256")
    .update(JSON.stringify({ method: s.method, lines }))
    .digest("hex");
}
export const connectionInput = z.object({
  id: z.string(),
  ip: z.string().ip(),
  port: z.number().int().min(1).max(65535),
  username: z.string().regex(/^[a-zA-Z0-9._@-]{1,64}$/),
  password: z.string().min(1).max(512),
});

export const deliveryInput = z.union([
  connectionInput,
  z.object({ id: z.string(), inventoryId: z.string().min(1) }),
]);
