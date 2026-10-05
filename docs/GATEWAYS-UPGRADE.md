# October 5 upgrade: inventory and payment gateways

## Upload using GitHub and Netlify

1. Back up your Neon database. In Neon's SQL editor check that the previous release's `Order`, `OrderItem`, `InventoryServer`, `Location`, `PaymentMethod`, and `SystemKey` tables exist. If not, apply `prisma/migrations/20261005000000_manual_orders/migration.sql` first. Do not rerun migrations already applied.
2. Run **prisma/migrations/20261005060000_gateways_inventory/migration.sql** in Neon's SQL editor, against the same database used by Netlify. This adds the matching Prisma fields and disables old Stripe/generic crypto methods. No accounts, orders, or server credentials are deleted. Schedule the rollout when no payments are in flight: old Stripe and generic adapter callbacks are no longer handled, so reconcile any outstanding legacy payments before switching.
3. Extract the source ZIP. In your GitHub `rdpusera` repository use **Add file → Upload files**, uploading the extracted contents into the repository root, replacing existing files. Include `src`, `prisma`, `package.json`, `package-lock.json`, and `netlify.toml`. Do not upload the ZIP itself as your website. Delete any tracked `.env` in GitHub. No secrets belong in the repository.
4. Netlify must build from this GitHub repository. Use `npm run build` and publish `.next`; the included `netlify.toml` sets both. Redeploy with the build cache cleared. A raw Netlify drag-and-drop source upload does not build the Next.js server/API.
5. Keep `DATABASE_URL`, `JWT_SECRET`, `CREDENTIAL_KEY`, `APP_URL=https://projectavocado.netlify.app`, and `DEMO_MODE=false` in Netlify environment settings. Keep your existing encryption key to preserve stored passwords. Do not disable secret scanning. Set the four integration keys below in Netlify or in **Admin → System keys**. The admin vault encrypts them; it never displays saved values.
6. Configure the provider webhooks, then enable the new methods under **Admin → Payments**. Use test credentials first where supported. Verify a payment, duplicate callback, wrong amount, automatic delivery, and pending delivery before accepting live orders.

If you use Prisma CLI migrations, use `npm run db:migrate` instead of manually executing SQL. SQL executed manually is not automatically recorded in Prisma's migration history: baseline the already-applied migration with `prisma migrate resolve --applied 20261005060000_gateways_inventory` before later running `migrate deploy`. Never mark an unapplied migration as applied.

## Payment configuration

| Key | Value from |
| --- | --- |
| FLUTTERWAVE_SECRET_KEY | Flutterwave account API secret key |
| FLUTTERWAVE_WEBHOOK_SECRET | Secret hash you configure in Flutterwave webhook settings |
| NOWPAYMENTS_API_KEY | NOWPayments API key |
| NOWPAYMENTS_IPN_SECRET | NOWPayments IPN secret |

Flutterwave webhook: `https://projectavocado.netlify.app/api/webhooks/flutterwave`.
NOWPayments IPN: `https://projectavocado.netlify.app/api/webhooks/nowpayments` (also sent with each invoice request).

Prices are USD. Enable USD collection in your Flutterwave account. Provider account eligibility, fees and supported payment methods depend on your merchant account. The site redirects to provider-hosted checkout and never collects card numbers. Redirects do not prove payment. Flutterwave callbacks are authenticated and transaction status, ID, currency, reference and amount are verified via its API. NOWPayments signatures use recursively sorted JSON with HMAC-SHA512; the API must report `finished`, the expected invoice/order/USD price and sufficient cryptocurrency received. Partially paid or merely confirmed transactions are not delivered. Duplicate verified callbacks settle once.

If checkout creation times out, the payment is intentionally locked against creating a duplicate invoice. Find its payment ID / `tx_ref` / `order_id` in your provider dashboard. A valid callback can reconcile a lost creation response. Otherwise an operator must confirm whether an invoice exists and restore its checkout URL/provider reference, or cancel the unpaid order and reconcile any eventual late payment before starting again. Do not blindly clear `checkoutStarted`, manually mark an online payment paid, or ask the customer to pay twice. Unexpected overpayments and second distinct transactions require operator reconciliation; the application does not automatically refund them. Legacy Stripe/crypto transactions also require reconciliation outside this new callback flow.

## Plans and delivery

Admin → Plans creates tiers with name, USD price, description, RAM, CPU, disk, OS, country and saleable capacity. Countries are a curated list of 100, not a statistical ranking. Selecting a country creates its location automatically; this does not create physical servers. Existing city locations remain intact when editing prices. Windows is first, followed by Ubuntu and Linux, with older detailed OS names preserved for existing plans.

Admin → Available servers stores encrypted credentials for real ready servers. A server belongs to one plan and must match its OS, location and base hardware. Paid base-spec orders atomically claim available inventory and become COMPLETE once every item is delivered. No matching inventory, disabled accounts, or customized hardware above the base tier leaves the item PENDING for manual verified delivery under Admin → Orders. Mixed orders can contain active and pending items. No credentials are delivered before payment. Adding inventory later does not silently release existing pending orders: use their inventory assignment form. Saleable plan stock and actual ready inventory are separate; adding a server does not increase stock automatically.

All plans receive the requested residential-IP description. This is catalog copy, not network provisioning or verification: the operator must supply actual residential-IP servers to substantiate it. OS selection does not install an operating system. Linux instances expose SSH credentials; an RDP desktop requires separately configured remote-desktop software.

## Validation and mobile changes

Confirmed code issues: Windows domain usernames (`DOMAIN\user` and `.\Administrator`) were rejected by an overly restrictive regex; nested field errors were flattened into an unhelpful generic message; generic Windows/Ubuntu/Linux choices were missing. These are corrected. IPs are trimmed and validated as IPv4/IPv6; enter the port separately. Ports remain integers 1–65535, matching PostgreSQL Int storage. Plan numeric ranges are also enforced server-side; currency is stored in integer cents. Missing tables/columns return a database-upgrade message. Without the failing live request, these fixes cannot establish which input triggered your particular error.

The viewport includes the requested `user-scalable=no`; inputs/selects/textareas use 16px text to prevent iOS focus zoom. Disabling user scaling can limit accessibility in browsers that honor it. The floating cart is fixed to the lower right, honors safe areas, and appears only when the cart has items. Guest navigation has no Dashboard link; plan browsing/configuration and the cart remain public, and checkout requires login.

## Verification

Production build and TypeScript checks pass. Eleven unit tests cover validation, country list, pricing, crypto signatures, money precision, encryption and origin checks. Nine database integration tests pass against an isolated PGlite PostgreSQL engine with all SQL migrations applied, including mocked provider checkout/webhook round trips, wrong signatures/amounts, duplicate payment, late-payment wallet credit, inventory assignment and custom-spec pending delivery. PGlite uses one connection; true concurrent PostgreSQL transaction isolation still needs the included GitHub Actions PostgreSQL-16 job. No live provider payments or production deployment were performed. The attempted browser smoke test could not complete in this environment, so device-level mobile behavior still requires acceptance testing.

Official API references: https://developer.flutterwave.com/docs/flutterwave-standard-1, https://developer.flutterwave.com/docs/webhooks, https://developer.flutterwave.com/docs/transaction-verification, https://documenter.getpostman.com/view/7907941/S1a32n38, https://github.com/NowPaymentsIO/nowpayments-sdk-nodejs.
