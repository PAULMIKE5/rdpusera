import "dotenv/config";
import { z } from "zod";
const env = z
  .object({
    DATABASE_URL: z.string().url(),
    APP_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    CREDENTIAL_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .safeParse(process.env);
if (!env.success) {
  console.error(
    "Invalid or missing environment keys:",
    Object.keys(env.error.flatten().fieldErrors).join(", "),
  );
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  if (
    process.env.DEMO_MODE === "true" ||
    !env.data.APP_URL.startsWith("https://")
  ) {
    console.error("Production requires HTTPS APP_URL and DEMO_MODE=false");
    process.exit(1);
  }
  if (/replace-with/.test(env.data.JWT_SECRET)) {
    console.error("Replace example secrets");
    process.exit(1);
  }
}
