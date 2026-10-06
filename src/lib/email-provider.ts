import { z } from "zod";
export const senderAddress = z
  .string()
  .trim()
  .max(254)
  .refine((value) => {
    if (/[\r\n]/.test(value)) return false;
    const match = /^([^<>]+) <([^<>]+)>$/.exec(value);
    return z
      .string()
      .email()
      .safeParse(match ? match[2] : value).success;
  }, "Use email@your-domain.com or GlobalRDP <email@your-domain.com>");
export class MailError extends Error {
  constructor(
    public code: string,
    public httpStatus?: number,
  ) {
    super(code);
  }
}
export const mailHelp: Record<string, string> = {
  INVALID_SENDER:
    "Set EMAIL_FROM to an address on your verified Resend domain. Display names are supported.",
  KEY_UNAVAILABLE:
    "Set RESEND_API_KEY. If using the admin vault, retain your original CREDENTIAL_KEY or re-save the API key.",
  AUTH: "Resend rejected the API key. Check that it is a Resend key with permission to send from this domain.",
  DOMAIN:
    "Verify the sender domain in Resend and ensure the key can send from it. The resend.dev test domain only sends to your account email.",
  VALIDATION:
    "Resend rejected the request. Check sender/domain permissions and the recipient in the Resend logs.",
  RATE_LIMIT:
    "Resend rate or sending quota reached. Check your Resend usage and retry later.",
  INVALID_RESPONSE:
    "Resend returned a response without a valid email ID. Check provider status and network access.",
  TIMEOUT:
    "Email request timed out. Check Resend logs before retrying; it may have been accepted.",
  NETWORK: "Could not reach Resend. Check outgoing HTTPS connectivity.",
  PROVIDER:
    "Resend could not accept the email. Check provider status and Resend logs.",
};
export async function sendResend(
  config: { from: string; key: string },
  message: { to: string; subject: string; text: string; id: string },
) {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key.trim()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.id,
      },
      body: JSON.stringify({
        from: senderAddress.parse(config.from),
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    throw new MailError(
      e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name)
        ? "TIMEOUT"
        : "NETWORK",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    // Classify without exposing raw provider payloads, API keys, addresses, or OTPs.
    const message = typeof result?.message === "string" ? result.message : "";
    const code =
      response.status === 429
        ? "RATE_LIMIT"
        : /domain|testing emails|verify.*sender/i.test(message)
          ? "DOMAIN"
          : [401, 403].includes(response.status)
            ? "AUTH"
            : response.status === 422 || response.status === 400
              ? "VALIDATION"
              : "PROVIDER";
    throw new MailError(code, response.status);
  }
  if (!result || typeof result.id !== "string" || !result.id.trim())
    throw new MailError("INVALID_RESPONSE", response.status);
  return result.id as string;
}
