import { systemKey } from "./config";
import { HttpError } from "./security";
import { db } from "./db";
import {
  MailError,
  senderAddress,
  sendResend,
  mailHelp,
} from "./email-provider";
export async function emailConfig() {
  let from: string;
  try {
    from = await systemKey("EMAIL_FROM");
  } catch {
    throw new MailError("INVALID_SENDER");
  }
  const sender = senderAddress.safeParse(from);
  if (!sender.success) throw new MailError("INVALID_SENDER");
  let key: string;
  try {
    key = (await systemKey("RESEND_API_KEY")).trim();
    if (!key || /\s/.test(key)) throw Error();
  } catch {
    throw new MailError("KEY_UNAVAILABLE");
  }
  return { from: sender.data, key };
}
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  id: string,
  purpose: string,
  diagnostic = false,
) {
  try {
    const providerId = await sendResend(await emailConfig(), {
      to,
      subject,
      text,
      id,
    });
    await db.emailAttempt
      .create({
        data: { purpose, status: "ACCEPTED", code: "ACCEPTED", providerId },
      })
      .catch(() => console.error('{"event":"email_log_unavailable"}'));
    return providerId;
  } catch (e) {
    const error = e instanceof MailError ? e : new MailError("PROVIDER");
    console.error(
      JSON.stringify({
        event: "email_failed",
        purpose,
        code: error.code,
        httpStatus: error.httpStatus,
      }),
    );
    await db.emailAttempt
      .create({
        data: {
          purpose,
          status: "FAILED",
          code: error.code,
          httpStatus: error.httpStatus,
        },
      })
      .catch(() => {});
    throw new HttpError(
      503,
      diagnostic
        ? `${error.code}: ${mailHelp[error.code]}`
        : "We could not send your email. Please try again in one minute or contact support.",
    );
  }
}
export async function sendVerification(
  email: string,
  code: string,
  id: string,
) {
  await sendEmail(
    email,
    "Your GlobalRDP verification code",
    `Your GlobalRDP verification code is ${code}. It expires in 10 minutes. Enter it on the registration screen to activate your account. Never share this code. If you did not request it, ignore this email.`,
    `verification/${id}`,
    "VERIFICATION",
  );
}
