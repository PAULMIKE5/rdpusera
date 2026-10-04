# GlobalRDP Hub

A complete Next.js / React / TypeScript source project for a prepaid RDP & VPS storefront. Tailwind and Lucide provide the dark dashboard. PostgreSQL and Prisma own sessions, inventory, instances, money, audit records, and durable jobs.

**Release status:** implementation with a working demo path, not a certified production deployment. Live infrastructure requires a provisioning adapter. Stripe is integrated; crypto is integration-ready through the explicit contract below. No real servers or payments were created during development. See `VERIFICATION.md` for checks actually run.

## Quick start

Prerequisites: Node.js 22+, npm, Docker Compose (or PostgreSQL 16+).

```sh
npm ci
cp .env.example .env
# Generate JWT_SECRET and CREDENTIAL_KEY separately:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Put these values in .env. Set ADMIN_EMAIL and a unique ADMIN_PASSWORD (16–72 bytes).
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal, run `npm run worker`. Open http://localhost:3000, create an account, choose Add funds → Add demo credits, and deploy a plan. The worker moves queued instances to ACTIVE. Demo IP `192.0.2.10` is documentation-only and will not connect. Demo metrics remain zero; they are not fake utilization estimates. Sign in with the seeded admin account to restock, disable users, and retry failed jobs. No hardcoded admin password exists, and seeding never overwrites an existing password.

Demo funding and the simulated provider are unavailable under NODE_ENV=production, even if DEMO_MODE=true. Run `npm run dev` for the demo; production builds require real provider configuration for fulfillment.

## Project map

```text
src/app/page.tsx                 dashboard, catalog, checkout, instances, billing, admin
src/app/api/auth/[action]/       login, register, logout
src/app/api/me/                  safe profile and wallet ledger
src/app/api/catalog/             validated public filters
src/app/api/instances/           user-owned instances and atomic checkout
src/app/api/instances/[id]/[action]/  reveal, RDP download, restart, terminate
src/app/api/funding/             Stripe, crypto, and local demo funding
src/app/api/webhooks/[provider]/ signed callbacks
src/app/api/admin/               revenue, inventory, users, failed jobs
src/lib/                        security, transactions, pricing, billing, provider
scripts/worker.ts               durable provisioning, retries, metrics, expiration
prisma/schema.prisma            relational data model
prisma/migrations/              initial PostgreSQL migration
prisma/seed.ts                  nine plans and optional administrator
scripts/                        background worker
tests/                         unit and PostgreSQL integration tests
.github/workflows/ci.yml         build, audit, unit and database gates
Dockerfile / compose.yaml       application image / local PostgreSQL
```

## Behavior and security

- JWT HS256 cookies are HttpOnly, SameSite=Strict, Secure in production, audience/issuer checked, and expire after eight hours. Every authenticated request checks its revocable database session and current user status/role. Logout revokes the session; disabling a user revokes all sessions.
- Passwords use bcrypt cost 12. Registration requires 12–72 bytes; passwords and stored server secrets are never sent in normal list responses. AES-256-GCM protects server credentials; only an authenticated owner can explicitly reveal them. Reveals are audited and hidden in the UI after 30 seconds. RDP files omit passwords.
- Mutating browser APIs require an exact configured Origin. Cookies stay out of localStorage. Zod validates inputs; ORM parameterization and tagged parameterized SQL avoid interpolation. No application secret uses a NEXT_PUBLIC prefix.
- Shared PostgreSQL rate limits cover global authentication, per-account login attempts, purchases, funding, and instance actions. No untrusted forwarding header is used as identity. Add ingress per-IP quotas and request body size limits; application body checks occur after reading the request.
- All money is integer USD cents. The server recomputes price. Serializable transactions reserve inventory, debit funds, create the instance, and enqueue provisioning together; serialization conflicts retry. User-scoped idempotency keys protect checkout retries.
- Signed payment callbacks validate payment ID, provider, provider reference, USD amount, and paid status. Wallet credit and ledger entry commit once in a single transaction. A callback arriving before the provider reference is stored returns an error; the gateway must retry.
- Jobs use `FOR UPDATE SKIP LOCKED`, leases, bounded backoff, and idempotent provider operations. Five failed attempts require admin retry. Ambiguous provisioning failures keep the reservation and debit until reconciled; they are never silently refunded while a server might exist.
- Purchase terms are 30 days prepaid, no automatic renewal and no termination refund. The worker queues termination after expiration. Deploy a continuously running worker; web request handlers do not execute background work.
- Uptime and bandwidth refresh from the provider every minute; the browser polls every ten seconds. Metrics retain the last successful values on provider failure. Initial admin lists are bounded to 100 users/jobs; add pagination before operating at larger scale.

## Pricing

Per 30-day term: base price + $3.50 per extra CPU + $1.80 per extra GB RAM + $0.08 per extra GB SSD. Prices never come from the browser. Customize the function in `src/lib/domain.ts` and the plan base prices. Inventory represents configurable capacity slots, not a guarantee that each combination is available at your upstream provider. Ensure stock reflects resource and Windows licensing capacity.

## Stripe

Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Configure a Stripe webhook at `/api/webhooks/stripe` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. The handler uses the untouched request body for Stripe signature verification. Checkout success redirects never credit balances. Use Stripe test keys and webhook forwarding in development. In production use HTTPS APP_URL, live keys, and the live endpoint secret.

Funding is wallet-based; checkout purchases deduct the wallet. Refunds, disputes, taxes, chargeback debt recovery, and financial reconciliation need business-specific operational policies before public sales. Do not treat deposited funds as earned revenue; the admin metric sums server purchases separately.

## Crypto adapter contract

A crypto processor was not selected, so this is a gateway integration contract, not a claim of native NOWPayments/Coinbase compatibility. Implement a trusted adapter for your chosen processor; verify the processor's own signatures, currency, network, confirmations, underpayments, and FX conversion there. The app must only receive confirmed USD-equivalent credits.

Set CRYPTO_CHECKOUT_URL to an HTTPS gateway endpoint and CRYPTO_API_KEY to its bearer credential. The app sends:

```json
{"paymentId":"internal-payment-id","cents":5000,"currency":"USD","callbackUrl":"https://your-domain/api/webhooks/crypto"}
```

It also sends `Idempotency-Key: <paymentId>`. The adapter must return the same invoice on retries:

```json
{"id":"processor-invoice-id","url":"https://processor.example/checkout/invoice"}
```

Callbacks carry `x-webhook-timestamp` (Unix seconds) and `x-webhook-signature` (hex HMAC-SHA256 of `timestamp + "." + exactRawBody`, using CRYPTO_WEBHOOK_SECRET). Five-minute freshness is enforced. Retry unsuccessful deliveries with a fresh timestamp/signature:

```json
{"paymentId":"internal-payment-id","providerId":"processor-invoice-id","cents":5000,"currency":"USD","status":"confirmed"}
```

`pending` and `failed` callbacks do not credit funds. Restrict checkout destination domains in your gateway. Keep raw signing keys in a secret manager.

## Live infrastructure contract

Set DEMO_MODE=false, PROVISIONER_URL=https://your-private-control-plane, and PROVISIONER_TOKEN. This backend-to-backend adapter isolates provider credentials and provider-specific APIs. No invented cloud provisioning API is embedded.

The worker POSTs to `/v1/provision`, `/v1/restart`, `/v1/terminate`, `/v1/metrics`. Every call includes bearer authentication, `Idempotency-Key: <job ID>`, and a JSON body with instanceId, providerId, cpu, ram, disk, region, and os. Metrics calls supply providerId only. Provision returns `{providerId, ip, username, password}`; restart/terminate return `{ok:true}` only after completion; metrics returns `{uptimeSeconds:123, bandwidthBytes:"456"}`.

**Required adapter guarantees:** same job ID returns the same completed result across retries; provisioning duplicates never create extra servers; terminate is idempotent; no success until the remote operation is actually complete; responses complete within 30 seconds (adapter can return retryable errors while work continues). Store operation outcomes durably in the adapter. Never return success for partial completion. Use HTTPS with a private network/egress allowlist and rotate tokens.

Failed jobs retain their visible transitional instance status. Inspect provider state using the job ID before retrying. A provider-side success plus local database failure is recovered by replaying the identical idempotent job. After permanent failure, an administrator must reconcile upstream resources before issuing any operational refund or restoring reserved capacity.

Manual restocking uses the admin panel. A new plan can also be created by an administrator via POST `/api/admin` with `action:"plan"` and the validated schema fields. The seed is rerunnable without resetting stock. There is no unauthenticated admin creation API.

## Deployment

1. Provision managed PostgreSQL on a private network with TLS, backups, PITR, monitoring, and a least-privilege runtime role. Use a separate migration role when possible.
2. Store secrets outside Git. Configure HTTPS APP_URL, a strong JWT_SECRET, and a 32-byte hex CREDENTIAL_KEY; preserve the credential key in a protected backup or stored credentials cannot be decrypted.
3. Build with `npm ci && npm run build`, migrate using `npm run db:migrate`, seed intentionally once. Run `npm start` and `npm run worker` as separate supervised services with NODE_ENV=production. Both need identical secrets and database access. The Docker image supports either command.
4. Terminate TLS at your load balancer; redirect HTTP to HTTPS and set HSTS there. Enforce body-size and per-IP rate limits at ingress. Keep the database and provisioning API private. Next response headers deny framing and constrain content; the baseline CSP permits inline framework scripts/styles. Adopt nonce CSP if your security policy requires it.
5. Monitor failed jobs, callback failures, wallet/ledger reconciliation, worker heartbeat, provider capacity, and expiration backlog. Alert on stale metrics and delayed terminations. Protect administrative access with your organization's identity proxy/MFA before public operation.
6. Validate the real gateway and provisioning adapter with sandbox credentials, exercise retries/outages, verify restore procedures, and run the CI suite. Complete a security review and production load test before accepting customers.

This project deliberately does not invent email delivery, password recovery, MFA, recurring subscription billing, tax rules, or provider accounts. Those are launch-specific integrations, not silently working features. Standard account sign-in/registration and prepaid purchases are implemented.

## Testing

```sh
npm test
npm run build
npm audit --omit=dev --audit-level=high
# Against a dedicated test database with migrations applied:
DATABASE_URL=postgresql://.../globalrdp_test RUN_DB_TESTS=true npm run test:integration
```

The integration tests enforce a dedicated database name, verify concurrent webhook idempotency and wallet overdraft protection, and clean their test records. GitHub Actions supplies PostgreSQL automatically. Never run integration tests against production.
