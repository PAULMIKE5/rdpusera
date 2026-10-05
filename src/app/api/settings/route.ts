import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { auth, origin, limit, HttpError } from "@/lib/security";
import { route, json, body } from "@/lib/http";
import { atomic } from "@/lib/db";
export const POST = route(async (req) => {
  origin(req);
  const { user, sessionId } = await auth();
  await limit(`settings:${user.id}`, 6, 900);
  const s = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("profile"),
        name: z.string().trim().max(80),
        email: z
          .string()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        currentPassword: z.string().max(72),
      }),
      z.object({
        action: z.literal("password"),
        currentPassword: z.string().max(72),
        password: z
          .string()
          .min(12)
          .max(72)
          .refine((v) => Buffer.byteLength(v) <= 72),
      }),
      z.object({
        action: z.literal("sessions"),
        currentPassword: z.string().max(72),
      }),
    ])
    .parse(await body(req));
  if (!(await bcrypt.compare(s.currentPassword, user.password)))
    throw new HttpError(403, "Current password is incorrect");
  const password =
    s.action === "password" ? await bcrypt.hash(s.password, 12) : null;
  await atomic(async (tx) => {
    if (s.action === "profile")
      await tx.user.update({
        where: { id: user.id },
        data: { name: s.name, email: s.email },
      });
    if (password)
      await tx.user.update({ where: { id: user.id }, data: { password } });
    await tx.session.deleteMany({
      where: {
        userId: user.id,
        ...(s.action === "password" ? {} : { id: { not: sessionId } }),
      },
    });
    await tx.audit.create({
      data: {
        actorId: user.id,
        action: `ACCOUNT_${s.action.toUpperCase()}`,
        targetId: user.id,
      },
    });
  });
  if (password) (await cookies()).delete("session");
  return json({ ok: true, signInAgain: !!password });
});
