import { systemKey } from "./config";
import { HttpError } from "./security";
import { z } from "zod";
export async function emailConfig() {
  const from = z.string().email().safeParse(process.env.EMAIL_FROM);
  if (!from.success)
    throw new HttpError(
      503,
      "Email verification is not configured. Please contact support.",
    );
  let key: string;
  try {
    key = await systemKey("RESEND_API_KEY");
  } catch {
    throw new HttpError(
      503,
      "Email verification is not configured. Please contact support.",
    );
  }
  return { from: from.data, key };
}
export async function sendVerification(
  email: string,
  code: string,
  id: string,
) {
  const { from, key } = await emailConfig();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `verification/${id}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Your GlobalRDP verification code",
        text: `Your GlobalRDP verification code is ${code}. It expires in 10 minutes. Enter it on the registration screen to activate your account. Never share this code. If you did not request it, ignore this email.`,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error("Email rejected");
    const result = await response.json();
    if (!result.id) throw Error("Email not accepted");
  } catch {
    throw new HttpError(
      503,
      "We could not send your verification email. Please try again in one minute.",
    );
  }
}
