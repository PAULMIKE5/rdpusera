import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { auth, issue, origin, limit, HttpError } from "@/lib/security";
import { route, body, json } from "@/lib/http";
import {
  credentials,
  registerAccount,
  verifyEmail,
  resendVerification,
  resumeVerification,
} from "@/lib/registration";
export const POST = route(async (req) => {
  origin(req);
  const action = new URL(req.url).pathname.split("/").pop();
  if (action === "logout") {
    const s = await auth();
    await db.session.deleteMany({ where: { id: s.sessionId } });
    (await cookies()).delete("session");
    return json({ ok: true });
  }
  if (!["login", "register", "verify", "resend"].includes(action ?? ""))
    throw new HttpError(404, "Not found");
  await limit("auth:global", 300);
  const input = await body(req);
  if (action === "verify") {
    const userId = await verifyEmail(input);
    await issue(userId);
    return json({ ok: true });
  }
  if (action === "resend") {
    const s = z
      .object({ challengeId: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(input);
    return json(await resendVerification(s.challengeId));
  }
  const data = credentials.parse(input);
  await limit(`auth:${data.email}`, 8, 900);
  if (action === "register") return json(await registerAccount(data), 202);
  const user = await db.user.findUnique({ where: { email: data.email } });
  const valid = await bcrypt.compare(
    data.password,
    user?.password ??
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7dkjM8P7M4uGUzLCaKbAKLBbOZSHM7a",
  );
  if (!valid || !user || user.disabled || user.deletedAt)
    throw new HttpError(401, "Invalid credentials");
  if (user.emailVerificationRequired && !user.emailVerifiedAt)
    return json(await resumeVerification(user.email), 202);
  await issue(user.id);
  return json({ ok: true });
});
