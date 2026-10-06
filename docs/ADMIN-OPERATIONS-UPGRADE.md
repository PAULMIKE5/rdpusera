# Admin operations, email, sessions and payment upgrade

This release targets PAULMIKE5/rdpusera and your existing Lightsail container service `container-service-1` in `us-east-2`. It does not change your live deployment or database until you apply it.

## What's included

- Registration collects full name and country of residence, validated on the server. OTP remains mandatory. Existing users retain access and can fill their country in Settings. Email changes are blocked until a verified email-change workflow is implemented; profile editing cannot bypass activation.
- Resend accepts both plain sender email and `GlobalRDP <mail@your-domain.com>`. Whitespace is trimmed; header injection is rejected. Non-JSON responses, missing acceptance IDs, invalid keys, domain restrictions, quotas and timeouts are distinguished without storing OTPs or provider response bodies.
- Admin Email provides an EMAIL_FROM editor, a test sent only to the signed-in administrator, and recent sanitized diagnostics. ACCEPTED means Resend accepted the request, not proof of inbox delivery. A verified sender domain and working API key are still required. Existing encrypted vault entries override environment values.
- Responsive admin sidebar / mobile horizontal navigation, searchable users/orders/transactions, seven/fourteen-day sales chart, quick actions, counts, recent audit log, and password confirmation for sensitive changes.
- Accounts: create with initial password and mandatory email activation, edit name/country, disable/enable, adjust balance and delete/anonymize once funds and service commitments are settled. Admin accounts cannot be deleted here. No privilege escalation UI is exposed.
- Orders: create for a selected customer using wallet or an enabled manual method; edit private notes; deliver paid orders; cancel/delete unpaid orders with stock release; archive completed orders and restore visibility. Deleted unpaid orders remain cancelled after restoration. Deleting a paid order does not refund money or terminate its services. Undelivered paid orders must be resolved before deletion.
- Transactions: list and search provider records; create credit/debit adjustments; edit manual adjustment amounts by posting an auditable wallet delta; edit notes; delete/restore settled records. Gateway amount, provider transaction ID and status are protected because changing them could break reconciliation or double-credit money. Pending payments must be reconciled before deletion. Deletion never reverses money; use an explicit adjustment.
- Direct server assignment: choose a verified customer, plan, inventory server or manual IP/port/username/password, duration and reason. Complimentary assignment consumes one plan capacity slot, checks address conflicts, encrypts credentials, creates an ACTIVE instance, and posts a notification to the customer's Support inbox. It does not execute a new machine provision or charge the wallet. Paid purchases should use Orders > Deliver instead. Credentials are never sent in chat/email.
- Live support: admins start a thread with any active customer; users access Dashboard > Support. Messages persist in PostgreSQL, poll every five seconds while visible, show read/new status in admin inbox, and support earlier history. This is polling-based chat, not a WebSocket or email service. Customers cannot read or post into another customer's conversation.
- Session fixes: SameSite=Lax supports top-level HTTPS payment returns while keeping HttpOnly/Secure cookies and strict origin checks on mutations. Temporary database/network failures no longer masquerade as logout. Login preserves approved internal return paths. Database-backed sessions and JWT secrets persist across process restart.
- Payment fixes: new checkout links return to `/payments/return?payment=...`. The page polls verified status every 15 seconds. Signed early NOWPayments IPNs retain provider payment IDs; final callbacks and return-page verification share idempotent settlement logic. Customer orders, wallet history, and admin Transactions expose verification controls. An optional receipt payment ID can reconcile a missed callback: server checks order, owner, invoice, amount, currency and final funded status. Merely returning from checkout never marks an order paid.

## Deploy in AWS CloudShell

1. Upload/commit the updated source to GitHub or upload and extract the supplied ZIP in CloudShell. Preserve existing files not included in this release. Remove any tracked `.env` from GitHub; secrets belong in hosting settings. The included `.dockerignore` excludes environment files from container builds.
2. Inside the updated project folder, build:

```bash
docker build -t globalrdp:latest .
```

3. Apply the database migration before enabling the new image. Back up the database first. In the same shell, enter your existing Neon connection string privately:

```bash
read -s -p "Paste your Neon DATABASE_URL, then press Enter: " DATABASE_URL
export DATABASE_URL
docker run --rm -e DATABASE_URL globalrdp:latest npx prisma migrate deploy
unset DATABASE_URL
```

The new additive migration is `prisma/migrations/20261006000000_admin_operations/migration.sql`. Existing balances, keys, passwords, orders and sessions are retained. If your database was manually created without Prisma migration history, use your established baselining procedure; do not reset it. The new SQL can be applied once in Neon SQL Editor if you manage schema manually, but you must also keep Prisma's migration history consistent before using `migrate deploy` later.

4. Upload the image. If the Lightsail plugin is absent, reinstall it in this session first:

```bash
sudo curl -fL https://s3.us-west-2.amazonaws.com/lightsailctl/latest/linux-amd64/lightsailctl -o /usr/local/bin/lightsailctl && sudo chmod +x /usr/local/bin/lightsailctl
aws lightsail push-container-image --region us-east-2 --service-name container-service-1 --label website --image globalrdp:latest
```

5. In Lightsail, create a new deployment using the **exact returned image reference**. Keep port 3000/HTTP, public endpoint `website:3000`, health path `/`, and your existing environment variables. Keep JWT_SECRET and CREDENTIAL_KEY unchanged. Set APP_URL to the single HTTPS hostname you actually use, with no trailing slash. Do not switch between the Netlify hostname, Lightsail hostname and a custom domain during a session: cookies are scoped to their host.
6. Save and deploy. Existing sessions with Strict cookies should sign out/in once to obtain a Lax cookie. Routine refreshes should then keep the same session until its eight-hour expiry, explicit logout, disable/deletion or password change. Every app replica must share the same JWT_SECRET and Neon database.

## Email activation checklist

1. Verify your own sending domain in Resend (SPF/DKIM records in your DNS). The AWS-provided website hostname is not your email domain.
2. Admin > System keys: save your RESEND_API_KEY using your administrator password.
3. Admin > Email: save EMAIL_FROM in either supported format; use an address on the verified domain. `resend.dev` is a restricted testing sender.
4. Send an admin email test. If it fails, read the error code and recent diagnostics; check the Resend dashboard for the matching attempt. No real emails were sent during development tests.
5. Register a new test user with full name/country, enter the received OTP and sign in. An invalid provider response must not activate an account.

## Crypto callback and redirect checklist

- Keep NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET configured (admin vault or environment).
- Callback URL must be `https://YOUR-CURRENT-DOMAIN/api/webhooks/nowpayments`; the new code attaches this automatically to new invoices using APP_URL.
- Update the callback in the provider dashboard as applicable. Invoices created before a domain change may still reference the old callback/return address. Use provider IPN replay or Admin > Transactions > Verify payment with provider with the receipt's NOWPayments payment ID. Do not use the invoice ID in that field and do not ask the customer to pay again.
- `waiting`, `confirming`, `confirmed`, `sending` and `partially_paid` are not treated as settled. Only server-verified `finished` with sufficient crypto amount credits/delivers the order.
- Flutterwave uses the equivalent verifier and return page, with FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_WEBHOOK_SECRET. Test/live keys must match the transaction environment.

## Verification performed

- Production Next.js build and TypeScript checks.
- 16 unit tests: email sender parsing, response validation and safe diagnostics; registration fields; gateway signatures, underpayment, cents, and security.
- 20 integration tests using a fresh isolated PGlite PostgreSQL-compatible database with all migrations. Tests cover OTP, stock/wallet rollbacks, duplicate callback settlement, archive/restore and late payments, stale balance writes, transaction corrections, direct assignment and chat ownership.
- One production-server HTTP integration test exercises multiple admin reloads, cookie flags, process restart/session persistence, CSRF/admin authorization, balance password checks, conversation access and logout.
- GitHub CI is configured for actual PostgreSQL 16, unit/integration tests, build and HTTP tests. PGlite serializes database access; full PostgreSQL concurrency is a CI gate rather than a verified live-database claim.
- Provider responses were mocked. No live customer messages, provider transactions, Neon migrations, production email delivery or AWS deployment were performed. Browser screenshot/real-device visual QA was not available in this environment.
