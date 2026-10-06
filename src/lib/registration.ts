import {
  randomBytes,
  randomInt,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { countries } from "./countries";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { atomic, db } from "./db";
import { HttpError, limit, required } from "./security";
import { sendVerification } from "./email";
export const emailAddress = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const credentials = z.object({
  email: emailAddress,
  password: z
    .string()
    .min(12)
    .max(72)
    .refine(
      (v) => Buffer.byteLength(v) <= 72,
      "Password must be at most 72 bytes",
    ),
});
export const profileInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(80)
    .refine((v) => !/[\x00-\x1f]/.test(v), "Invalid name"),
  countryCode: z
    .string()
    .refine(
      (v) => countries.some((c) => c.code === v),
      "Select your country of residence",
    ),
});
export const registrationInput = credentials.merge(profileInput);
export function otpHash(id: string, code: string) {
  return createHmac("sha256", required("JWT_SECRET"))
    .update(`email-otp:${id}:${code}`)
    .digest("hex");
}
function challenge() {
  const id = randomBytes(32).toString("hex"),
    code = String(randomInt(0, 1000000)).padStart(6, "0");
  return {
    code,
    data: {
      id,
      codeHash: otpHash(id, code),
      expiresAt: new Date(Date.now() + 600000),
      attempts: 0,
      sentAt: new Date(),
    },
  };
}
async function deliver(email: string, c: ReturnType<typeof challenge>) {
  try {
    await limit("otp-send:global", 100, 3600);
    await sendVerification(email, c.code, c.data.id);
  } catch (e) {
    await db.emailVerification.deleteMany({ where: { id: c.data.id } });
    throw e;
  }
  return {
    verificationRequired: true,
    challengeId: c.data.id,
    email,
    retryAfter: 60,
  };
}
export async function registerAccount(
  input: z.infer<typeof registrationInput>,
) {
  const data = registrationInput.parse(input);
  await limit(`otp-send:${data.email}`, 1, 60);
  await limit(`otp-send-hour:${data.email}`, 5, 3600);
  const password = await bcrypt.hash(data.password, 12),
    c = challenge();
  await atomic(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: data.email } });
    if (
      user &&
      (user.emailVerifiedAt ||
        !user.emailVerificationRequired ||
        user.disabled ||
        user.deletedAt)
    )
      throw new HttpError(409, "Unable to register. Try signing in instead.");
    // Re-registration can reclaim an unverified address; all older challenges are invalidated.
    user = user
      ? await tx.user.update({
          where: { id: user.id },
          data: { password, name: data.name, countryCode: data.countryCode },
        })
      : await tx.user.create({
          data: {
            email: data.email,
            password,
            name: data.name,
            countryCode: data.countryCode,
          },
        });
    await tx.emailVerification.upsert({
      where: { userId: user.id },
      create: { ...c.data, userId: user.id },
      update: c.data,
    });
  });
  return deliver(data.email, c);
}
export const verificationInput = z.object({
  challengeId: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().regex(/^\d{6}$/, "Enter the six-digit code from your email"),
});
export async function verifyEmail(input: z.infer<typeof verificationInput>) {
  const data = verificationInput.parse(input);
  const result = await atomic(async (tx) => {
    const c = await tx.emailVerification.findUnique({
      where: { id: data.challengeId },
      include: { user: true },
    });
    if (
      !c ||
      c.expiresAt <= new Date() ||
      c.attempts >= 5 ||
      c.user.disabled ||
      c.user.deletedAt ||
      c.user.emailVerifiedAt
    )
      return null;
    const actual = Buffer.from(otpHash(c.id, data.code), "hex"),
      expected = Buffer.from(c.codeHash, "hex");
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      await tx.emailVerification.update({
        where: { id: c.id },
        data: { attempts: { increment: 1 } },
      });
      return null;
    }
    await tx.user.update({
      where: { id: c.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await tx.emailVerification.delete({ where: { id: c.id } });
    return c.userId;
  });
  if (!result)
    throw new HttpError(
      400,
      "Code invalid, expired, or attempts exhausted. Request a new code.",
    );
  return result;
}
export async function resendVerification(id: string) {
  const row = await db.emailVerification.findUnique({
    where: { id },
    include: { user: true },
  });
  if (
    !row ||
    row.user.emailVerifiedAt ||
    row.user.disabled ||
    row.user.deletedAt
  )
    throw new HttpError(400, "Start registration again to request a code.");
  await limit(`otp-send:${row.user.email}`, 1, 60);
  await limit(`otp-send-hour:${row.user.email}`, 5, 3600);
  const c = challenge();
  const changed = await db.emailVerification.updateMany({
    where: { id },
    data: c.data,
  });
  if (!changed.count)
    throw new HttpError(
      409,
      "A newer code was requested. Use the latest registration screen.",
    );
  return deliver(row.user.email, c);
}
export async function resumeVerification(email: string) {
  const row = await db.emailVerification.findUnique({
    where: {
      userId: (await db.user.findUniqueOrThrow({ where: { email } })).id,
    },
  });
  if (row && row.expiresAt > new Date() && row.attempts < 5)
    return {
      verificationRequired: true,
      challengeId: row.id,
      email,
      retryAfter: Math.max(
        0,
        60 - Math.floor((Date.now() - row.sentAt.getTime()) / 1000),
      ),
    };
  // Login has already checked the password; only issue a fresh challenge if needed.
  await limit(`otp-send:${email}`, 1, 60);
  await limit(`otp-send-hour:${email}`, 5, 3600);
  const user = await db.user.findUniqueOrThrow({ where: { email } }),
    c = challenge();
  await db.emailVerification.upsert({
    where: { userId: user.id },
    create: { ...c.data, userId: user.id },
    update: c.data,
  });
  return deliver(email, c);
}
