import { z } from "zod";
import { randomBytes } from "node:crypto";
import { demo, required } from "./security";
export const provisionResult = z.object({
  providerId: z.string(),
  ip: z.string().ip(),
  username: z.string().regex(/^[a-zA-Z0-9._@-]{1,64}$/),
  password: z.string().min(12),
});
export async function provider(action: string, id: string, payload: unknown) {
  if (demo()) {
    if (action === "PROVISION")
      return {
        providerId: `demo-${id}`,
        ip: "192.0.2.10",
        username: "Administrator",
        password: randomBytes(18).toString("base64url"),
      };
    if (action === "METRICS") return { uptimeSeconds: 0, bandwidthBytes: "0" };
    return { ok: true };
  }
  const url = new URL(required("PROVISIONER_URL"));
  if (url.protocol !== "https:") throw Error("Provisioner requires HTTPS");
  const r = await fetch(new URL(`/v1/${action.toLowerCase()}`, url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required("PROVISIONER_TOKEN")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": id,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error(`Provider HTTP ${r.status}`);
  const result = await r.json();
  if (action === "RESTART" || action === "TERMINATE")
    return z.object({ ok: z.literal(true) }).parse(result);
  return result;
}
