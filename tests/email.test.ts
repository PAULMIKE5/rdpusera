import test from "node:test";
import assert from "node:assert/strict";
import {
  senderAddress,
  sendResend,
  MailError,
} from "../src/lib/email-provider";
import { registrationInput } from "../src/lib/registration";
test("sender supports display name, trims whitespace and blocks header injection", () => {
  assert.equal(
    senderAddress.parse("  GlobalRDP <hello@example.com>  "),
    "GlobalRDP <hello@example.com>",
  );
  assert.ok(senderAddress.safeParse("hello@example.com").success);
  for (const value of [
    "https://example.com",
    "hello@example.com\r\nBcc: other@example.com",
    "Name <not-an-email>",
  ])
    assert.equal(senderAddress.safeParse(value).success, false);
});
test("Resend validates acceptance and classifies errors without exposing response secrets", async () => {
  const original = globalThis.fetch;
  const config = { from: "GlobalRDP <hello@example.com>", key: " re_test " };
  const message = {
    to: "customer@example.com",
    subject: "Test",
    text: "verification code is 123456",
    id: "verification/test-id",
  };
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer re_test",
      );
      assert.equal(
        (init?.headers as Record<string, string>)["Idempotency-Key"],
        message.id,
      );
      return Response.json({ id: "accepted-id" });
    };
    assert.equal(await sendResend(config, message), "accepted-id");
    for (const response of [
      new Response("<html>proxy error</html>"),
      Response.json({ data: {} }),
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(
        sendResend(config, message),
        (e: unknown) => e instanceof MailError && e.code === "INVALID_RESPONSE",
      );
    }
    globalThis.fetch = async () =>
      Response.json(
        { message: "Domain not verified: secret@example.com re_sensitive" },
        { status: 403 },
      );
    await assert.rejects(
      sendResend(config, message),
      (e: unknown) =>
        e instanceof MailError &&
        e.code === "DOMAIN" &&
        !e.message.includes("sensitive"),
    );
    globalThis.fetch = async () =>
      Response.json({ message: "API key invalid" }, { status: 401 });
    await assert.rejects(
      sendResend(config, message),
      (e: unknown) => e instanceof MailError && e.code === "AUTH",
    );
    globalThis.fetch = async () => {
      throw new DOMException("timed out", "TimeoutError");
    };
    await assert.rejects(
      sendResend(config, message),
      (e: unknown) => e instanceof MailError && e.code === "TIMEOUT",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("registration requires name and supported country without weakening password validation", () => {
  const credentials = {
    email: "you@example.com",
    password: "a-long-test-password",
  };
  assert.equal(registrationInput.safeParse(credentials).success, false);
  assert.equal(
    registrationInput.safeParse({
      ...credentials,
      name: "Test Customer",
      countryCode: "ZZ",
    }).success,
    false,
  );
  assert.equal(
    registrationInput.parse({
      ...credentials,
      name: " Test Customer ",
      countryCode: "NG",
    }).name,
    "Test Customer",
  );
});
