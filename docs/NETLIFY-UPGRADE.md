> Historical first-upgrade guide. For the current Flutterwave/NOWPayments and automatic inventory release, follow [GATEWAYS-UPGRADE.md](GATEWAYS-UPGRADE.md).

# Upgrade the existing Netlify site (browser-only)

This release changes **new** purchases to manual delivery. Existing automated instances and their jobs remain available. No production database was accessed during implementation.

## 1. Update Neon before deploying the new code

Back up the database in Neon. In this GitHub branch, open:

`prisma/migrations/20261005000000_manual_orders/migration.sql`

Select **Raw**, copy all SQL, and run it **once** in the SQL Editor for the same Neon database used by Netlify. This migration assumes the original tables already exist. Do not rerun the original initial migration. Existing user accounts, balances, instances and payment history are preserved. Existing plan locations are copied into editable location records. Empty catalogs remain empty; create Locations and Plans in Admin after deploying.

If you have Prisma migration history managed by a CLI, use `npm run db:migrate` instead of applying SQL manually. A manually applied migration must later be marked with `prisma migrate resolve --applied 20261005000000_manual_orders` before switching back to Prisma-managed deployments (and baseline the original migration if it was also manually applied).

## 2. Deploy the updated code

Merge the feature pull request into main. Netlify should build the connected repository. The included `netlify.toml` uses `npm run build` and `.next`. The build uses Webpack to avoid the earlier Turbopack cache issue. Clear the build cache on this upgrade.

Keep `DATABASE_URL`, `APP_URL`, `JWT_SECRET` and `CREDENTIAL_KEY` in Netlify environment settings, never in GitHub files. APP_URL must match the exact HTTPS domain being used. Keep the existing CREDENTIAL_KEY: it encrypts server details and the new integration-key vault. Leave secret scanning enabled. No secret values are included in this branch.

## 3. Open Admin

Sign in with an account whose User.role is ADMIN. Admin is available at `/admin` and in the navigation. GitHub access does not grant application admin permissions. If necessary, use the previously explained email-specific SQL in Neon to promote only your own existing account.

- **Locations:** create/edit cities and region labels; disabling a location hides its plans from new purchases.
- **Plans:** create/edit prices (USD cents), specs, stock and availability. Disabling a plan does not delete order history. Set stock to currently saleable capacity.
- **Payments:** enable Stripe, crypto gateway or manual bank-transfer methods. Provide public instructions for manual payments. Never paste secret keys into these instructions.
- **System keys:** save payment integration secrets; values are encrypted and masked, and changes require your admin password. Deployment roots (JWT_SECRET, CREDENTIAL_KEY, DATABASE_URL, APP_URL) remain in Netlify. Old webhook signatures will require the matching original secret during key rotation; coordinate processor endpoint changes.
- **Available servers:** optionally store ready server credentials, then assign them during delivery. Pool entries match a plan's base specs. Custom specifications require manually checked details. Adding a pool entry does not automatically increase saleable plan stock.

## 4. Fulfill an order

1. Customer adds configured plans to `/cart` and checks out. Prices and stock are validated again on the server. Inventory is reserved atomically.
2. Wallet payment immediately creates a paid **PENDING** order. Card/crypto orders are **AWAITING_PAYMENT** until a verified callback succeeds. Manual-transfer orders remain awaiting payment until an administrator verifies receipt in the actual payment account and confirms it with their password.
3. In **Admin → Orders**, enter IP, port, username and password for each paid pending server, or assign matching available inventory.
4. Each server becomes ACTIVE and its 30-day term starts on delivery. The whole order becomes COMPLETE only when all items have been delivered. Customers see credentials under My instances; credentials never appear in general order lists.

Manual delivery does not need the automatic provisioning worker. Customer restart/termination requests appear under **Service requests**: perform the operation at your actual hosting provider before marking it done. Manually delivered servers must also be expired/terminated at the hosting provider; expired credentials are blocked by the app, but the app cannot shut down a machine without a provider API. Existing AUTO instances still require the original worker.

## 5. Manage customers and reservations

Edit active customer plan assignments and expiry under **Instances**, after applying physical changes at your hosting provider. Existing invoices remain unchanged and no automatic additional charge is made. OS/location changes require replacement delivery rather than relabeling a running machine.

Account deletion revokes access and anonymizes the profile, retaining billing/audit records. It is blocked while funds, live servers, orders or payments need settlement. Administrator accounts cannot be deleted through this screen.

Unpaid orders reserve stock until the customer or administrator cancels them; review abandoned reservations regularly. Cancellation releases stock once. If a valid payment arrives after cancellation, funds are credited to the user's wallet instead of overselling a server. Refunds/chargebacks still require your payment-provider reconciliation process.

## Checks

`npm test` covers pricing, encryption, Origin checks, cart limits, fingerprinting and delivery validation. CI starts PostgreSQL and verifies migrations, payment replay, stock races, manual confirmation, partial delivery, inventory assignment, cancellation, and deletion safeguards. Build/type checks run for every PR.
