import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}
function jwtKey() {
  const s = required("JWT_SECRET");
  if (s.length < 32) throw new Error("JWT_SECRET too short");
  return new TextEncoder().encode(s);
}
export function demo() {
  return (
    process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production"
  );
}
export async function issue(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (
    !user ||
    user.disabled ||
    user.deletedAt ||
    (user.emailVerificationRequired && !user.emailVerifiedAt)
  )
    throw new HttpError(403, "Verify your email before signing in");
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 8 * 3600000);
  await db.session.create({ data: { id, userId, expiresAt } });
  const token = await new SignJWT({ sid: id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("globalrdp")
    .setAudience("globalrdp-web")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(jwtKey());
  (await cookies()).set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}
export async function auth(admin = false) {
  try {
    const token = (await cookies()).get("session")?.value;
    if (!token) throw Error();
    const { payload } = await jwtVerify(token, jwtKey(), {
      algorithms: ["HS256"],
      issuer: "globalrdp",
      audience: "globalrdp-web",
    });
    const s = await db.session.findUnique({
      where: { id: String(payload.sid) },
      include: { user: true },
    });
    if (
      !s ||
      s.userId !== payload.sub ||
      s.expiresAt < new Date() ||
      s.user.disabled ||
      s.user.deletedAt ||
      (s.user.emailVerificationRequired && !s.user.emailVerifiedAt)
    )
      throw Error();
    if (admin && s.user.role !== "ADMIN")
      throw new HttpError(403, "Administrator access required");
    return { user: s.user, sessionId: s.id };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, "Please sign in");
  }
}
export function origin(req: Request) {
  if (req.headers.get("origin") !== new URL(required("APP_URL")).origin)
    throw new HttpError(403, "Invalid request origin");
}
export async function limit(key: string, max: number, seconds = 60) {
  const hash = createHash("sha256").update(key).digest("hex");
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" (key,count,"expiresAt") VALUES (${hash},1,NOW()+${seconds}*INTERVAL '1 second') ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "RateLimit"."expiresAt"<NOW() THEN 1 ELSE "RateLimit".count+1 END,"expiresAt"=CASE WHEN "RateLimit"."expiresAt"<NOW() THEN NOW()+${seconds}*INTERVAL '1 second' ELSE "RateLimit"."expiresAt" END RETURNING count`;
  if (rows[0].count > max)
    throw new HttpError(429, "Too many requests. Try later.");
}
function key() {
  const s = required("CREDENTIAL_KEY");
  if (!/^[a-f0-9]{64}$/i.test(s)) throw Error("Invalid encryption key");
  return Buffer.from(s, "hex");
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  return Buffer.concat([
    iv,
    c.update(value, "utf8"),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
export function decrypt(value: string) {
  const b = Buffer.from(value, "base64");
  const c = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString(
    "utf8",
  );
}
