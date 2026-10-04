import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { auth, issue, origin, limit, HttpError } from "@/lib/security";
import { route, body, json } from "@/lib/http";
const credentials = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(12)
    .max(72)
    .refine((v) => Buffer.byteLength(v) <= 72),
});
export const POST = route(async (req) => {
  origin(req);
  const action = new URL(req.url).pathname.split("/").pop();
  if (action === "logout") {
    const s = await auth();
    await db.session.deleteMany({ where: { id: s.sessionId } });
    (await cookies()).delete("session");
    return json({ ok: true });
  }
  if (action !== "login" && action !== "register")
    throw new HttpError(404, "Not found");
  await limit("auth:global", 300);
  const data = credentials.parse(await body(req));
  await limit(`auth:${data.email}`, 8, 900);
  let user = await db.user.findUnique({ where: { email: data.email } });
  if (action === "register") {
    if (user) throw new HttpError(409, "Unable to create this account");
    user = await db.user.create({
      data: {
        email: data.email,
        password: await bcrypt.hash(data.password, 12),
      },
    });
  } else {
    const hash =
      user?.password ??
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7dkjM8P7M4uGUzLCaKbAKLBbOZSHM7a";
    const valid = await bcrypt.compare(data.password, hash);
    if (!valid || !user || user.disabled)
      throw new HttpError(401, "Invalid credentials");
  }
  await issue(user!.id);
  return json({ ok: true });
});
