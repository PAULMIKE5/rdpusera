# GlobalRDP Hub

**Latest Lightsail release:** follow [the admin, email, chat and payment upgrade guide](docs/ADMIN-OPERATIONS-UPGRADE.md). Apply its additive database migration before deploying the new container.

Next.js marketplace with PostgreSQL/Prisma, authenticated customer and admin dashboards, public fixed-spec plans, cart checkout, Flutterwave fiat payments, NOWPayments cryptocurrency payments and encrypted RDP inventory.

**Existing Netlify deployment:** follow [the email and cart upgrade guide](docs/EMAIL-CART-UPGRADE.md). It includes the Neon SQL file, manual GitHub upload steps, payment keys, webhook URLs and rollout checks. Source changes are not a live deployment.

## Local setup

Use Node.js 22+ and PostgreSQL 16+. Run:

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL, APP_URL, JWT_SECRET and CREDENTIAL_KEY in the local .env.
# Generate each independent secret using crypto.randomBytes(32).toString('hex').
# CREDENTIAL_KEY must be 64 hex characters. Never commit .env.
npm run db:generate
npm run db:migrate
# Optional: configure ADMIN_EMAIL and a unique ADMIN_PASSWORD (16–72 bytes), then:
npm run db:seed
npm run dev
```

The seed creates example catalog plans and the configured admin account; it does not create real servers. Configure payment keys in Admin → System keys or environment variables, enable payment methods, and add ready server credentials in Admin → Available servers. Verify your supplied servers match their hardware, OS, location and residential-IP claims.

## Routes and behavior

- `/`: public catalog with locked hardware and prices.
- `/cart`: persistent cart with required country selection and Windows-first OS selection; verified login required at checkout.
- `/dashboard`: account balance, active instances and plans. Orders, billing, instances and settings are nested routes.
- `/admin`: restricted plans/pricing, locations, payment methods, encrypted integration keys, users, orders and inventory management.
- `/api/webhooks/flutterwave` and `/api/webhooks/nowpayments`: authenticated callbacks verified against provider APIs.

New accounts activate only after an emailed six-digit OTP is verified. Configure RESEND_API_KEY and EMAIL_FROM before launch.

Paid orders claim ready inventory matching the plan, country and OS atomically. Unavailable configurations stay pending for admin delivery; the order completes only when all items are delivered. The 30-day term starts at delivery. Wallet debits, reservations, order transitions and receipt deduplication run in database transactions. Pricing uses integer USD cents. Connection passwords and admin integration keys are encrypted; authentication uses bcrypt, JWT and revocable database sessions. Mutations enforce authentication, origin checks, validation and rate limits.

Manual instances use admin service requests for restart/termination; those buttons do not themselves operate a hosting provider. Existing AUTO instances may still use `npm run worker` with a compatible `PROVISIONER_URL`/`PROVISIONER_TOKEN` adapter. New inventory/manual delivery does not require that worker.

## Checks

```sh
npm test
npm run typecheck
npm run build
# Dedicated database named globalrdp_test only:
RUN_DB_TESTS=true npm run test:integration
```

Never point integration tests at production. The GitHub Actions workflow uses an isolated PostgreSQL service. See [verification and rollout details](docs/GATEWAYS-UPGRADE.md#verification). Provider callbacks are tested with mocked network responses; live merchant credentials and end-to-end acceptance checks remain necessary before launch.
