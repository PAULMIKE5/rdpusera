# Verified registration and configured cart upgrade

This release adds email OTP activation, fixed plan hardware/pricing, country and OS configuration in the cart, ten-cent payments, and a responsive visual redesign.

## Deploy with GitHub, Neon and Netlify

1. Back up Neon. This release assumes the prior `20261005060000_gateways_inventory` migration has already been applied.
2. In Neon SQL Editor, run `prisma/migrations/20261005110000_email_configuration/migration.sql` once. It creates the email-verification table and adds verification and server-configuration fields. Existing accounts retain access; they are explicitly grandfathered rather than falsely marked email-verified. New accounts require verification.
3. Extract this release ZIP and upload its **contents** to the root of your `rdpusera` GitHub repository, replacing the existing files. Include `src`, `prisma`, `package.json`, `package-lock.json` and `netlify.toml`. Do not upload the ZIP as the website. Remove any tracked `.env` file. The package contains a placeholder `.env.example`, never live credentials.
4. Configure the email integration below before accepting new registrations. The application refuses to activate new accounts if email delivery fails.
5. Deploy through Netlify's GitHub integration with `npm run build` and `.next`. Keep your existing DATABASE_URL, JWT_SECRET and CREDENTIAL_KEY. APP_URL remains your public site origin and must not be marked as a secret. Keep secret scanning enabled.
6. Test a real registration, receive and enter the OTP, add a fixed plan, select country and OS, and complete a provider test transaction. Check both matching-inventory and pending-delivery behavior before accepting live purchases.

If you normally use Prisma CLI migrations, run `npm run db:migrate` instead of manually running SQL. SQL applied manually must be recorded in Prisma's migration history (`prisma migrate resolve --applied 20261005110000_email_configuration`) before a future `migrate deploy`. Only mark it applied after the SQL succeeds. Do not rerun previous migrations or reset your production database.

## Email delivery: Resend

Create a Resend account and verify a domain you control by adding its required DNS records. A Netlify subdomain alone is not an email-sending domain you control. Create a sending API key, and use an address on your verified domain.

Set these in Netlify environment variables:

```dotenv
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=verification@your-verified-domain.com
```

Replace both placeholders. Mark RESEND_API_KEY as secret. EMAIL_FROM is the public sender address. The API key may instead be saved in **Admin → System keys → RESEND_API_KEY**; the admin vault takes precedence over the environment. EMAIL_FROM is configured in Netlify. Redeploy after changing environment variables. Do not use Resend's restricted default test sender for real customers.

No extra OTP secret is required: keyed hashes use the existing JWT_SECRET with a separate email-verification context. Codes are never returned by the API or logged. Your mail provider necessarily receives the email/code to deliver it.

Registration sends a random six-digit code. Codes expire after 10 minutes, allow five failed guesses, and work once. Resends are limited to one per minute and five per hour per email; each invalidates the old challenge. Pending users receive no session and cannot access dashboards, fund a wallet or place orders. Returning unverified users can sign in with their password to resume verification. A failed send leaves the account inactive; wait one minute and retry registration/sign-in. Provider delivery/SMTP failures still require checking your Resend logs, domain status, spam folder and sending limits.

## Plans, countries, and inventory

The homepage displays admin-defined CPU, RAM, storage and price as read-only values. Customers add predefined tiers; they cannot resize hardware at checkout, including via forged API requests. Administrators still manage plan specs and prices. This release does not replace existing plans with sample tiers: to offer Basic with 1 vCPU and 2GB RAM, create that tier in Admin → Plans.

Every cart row requires a country from the curated 100-country list and an operating system. Windows is the default/first choice, followed by Ubuntu and Linux. Rows can be configured independently, including two copies of a tier in different countries. Configuration persists through login/OTP verification and is saved on the order and instance. Countries are a curated selection, not a statistical ranking. Selecting a country does not create infrastructure there.

Add ready servers in **Admin → Available servers**, specifying the actual country, operating system, plan and access details. Automatic assignment requires matching country, OS, plan and sufficient hardware. Without a matching ready server, a paid order stays pending for administrator fulfillment. For previously stocked servers, the migration derives country and OS from their plan. Inventory with an unknown country cannot be automatically delivered: retire and re-add it with verified metadata. Never label an existing server as a different country/OS merely to match an order.

Plan location is retained as an administrative default; the cart configuration determines the requested delivery country and OS. Disabled country locations cannot be ordered. Existing historical order snapshots and credentials remain intact.

## Decimal amounts

The deposit minimum is $0.10 (10 cents), with a $1,000 per-request maximum. Admin plan prices also support a minimum of $0.10 and steps of $0.01. Dollar input is parsed exactly into integer cents; PostgreSQL monetary fields stay Int to avoid floating-point accounting errors. Provider or payment-network minimums may exceed the application's minimum, especially for crypto. The app does not override those restrictions. Existing balances and prices are not changed by the migration.

There is no withdrawal/payout flow in this repository. This release does not add payouts or claim to enforce a payout minimum on a nonexistent flow.

## Verification

- Unit checks cover cart configuration, idempotency, integer-cent conversion, webhook signatures, credentials, and input validation.
- Database integration checks cover OTP activation, attempts, expiry, resend/replay, failed mail delivery, fixed hardware enforcement, inventory matching, and existing payment behavior. Email and payment HTTP responses are mocked; no actual mail or payment was sent during these tests.
- A dedicated PostgreSQL service in the included GitHub Actions workflow runs the integration suite. Local integration verification uses isolated PGlite with one connection; this does not establish real multi-connection PostgreSQL behavior.
- See `VERIFICATION.md` for the final build/browser outcomes.

Resend API reference: https://resend.com/docs/api-reference/emails/send-email
