import { z } from "zod";
import { checkoutSystems, countries } from "./countries";
export const specs = z.object({
  planId: z.string().min(1).max(100),
  countryCode: z.string().refine((v) => countries.some((c) => c.code === v)),
  os: z.enum(checkoutSystems),
  cpu: z.number().int().min(1).max(32),
  ram: z.number().int().min(1).max(128),
  disk: z.number().int().min(20).max(2000),
  requestKey: z.string().uuid(),
});
export function price(
  plan: { cpu: number; ram: number; disk: number; baseCents: number },
  s: { cpu: number; ram: number; disk: number },
) {
  if (s.cpu < plan.cpu || s.ram < plan.ram || s.disk < plan.disk)
    throw new Error("Specs cannot be below plan minimums");
  return (
    plan.baseCents +
    (s.cpu - plan.cpu) * 350 +
    (s.ram - plan.ram) * 180 +
    (s.disk - plan.disk) * 8
  );
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
