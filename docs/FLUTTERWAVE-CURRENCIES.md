# Separate Naira and USD checkout

This update adds two Flutterwave choices in the cart and wallet funding page:

| Choice | Currency sent to Flutterwave | Payment methods |
| --- | --- | --- |
| Pay in Naira | NGN | Bank transfer, cards, USSD |
| Pay in USD | USD | Cards |

Both use the existing FLUTTERWAVE_SECRET_KEY and FLUTTERWAVE_WEBHOOK_SECRET and the same `/api/webhooks/flutterwave` endpoint. No new Flutterwave account or API key is required. Your account must be approved for the currencies and methods you enable. A USD charge does not restrict cards to US-issued cards or require the cardholder's account currency to be USD; issuer acceptance and conversion remain with Flutterwave/the issuing bank.

## Deploy on your existing AWS service

1. Upload the extracted project files to PAULMIKE5/rdpusera, preserving their folders. Do not upload the ZIP as the only file. Include the new migration and source files. Remove any tracked `.env` from GitHub; uploading an archive does not delete an old file. Keep credentials in Lightsail settings. The supplied `.dockerignore` prevents environment files from entering a container image.
2. In CloudShell, clone the updated repository into a fresh directory:

```bash
rdp_update_dir=$(mktemp -d)
git clone https://github.com/PAULMIKE5/rdpusera.git "$rdp_update_dir"
cd "$rdp_update_dir"
ls prisma/migrations/20261007000000_flutterwave_currencies/migration.sql
docker build -t globalrdp:latest .
```

3. Back up Neon, then apply migrations BEFORE activating the new image:

```bash
read -s -p "Paste your DATABASE_URL and press Enter: " DATABASE_URL
export DATABASE_URL
docker run --rm -e DATABASE_URL globalrdp:latest npx prisma migrate deploy
unset DATABASE_URL
```

Stop on migration errors; do not reset a live database. If tables were created manually and migration history was never established, resolve the baseline before using `migrate deploy`. The new migration is additive; existing USD payments keep their IDs, amounts and reconciliation path.

4. Install the upload plugin if this CloudShell session does not have it, then push the image:

```bash
sudo curl -fL https://s3.us-west-2.amazonaws.com/lightsailctl/latest/linux-amd64/lightsailctl -o /usr/local/bin/lightsailctl
sudo chmod +x /usr/local/bin/lightsailctl
aws lightsail push-container-image --region us-east-2 --service-name container-service-1 --label website --image globalrdp:latest
```

5. Lightsail > Containers > container-service-1 > Deployments > Modify your deployment. Choose the exact NEW stored image returned by the push command. Keep the existing environment variables, original JWT_SECRET and CREDENTIAL_KEY, port 3000/HTTP, and health path `/`. APP_URL must be your current HTTPS website origin. Save and deploy; wait for Active. A GitHub upload alone does not update Lightsail.

## Configure the payment choices

1. Open Admin > Payments. The migration retains the current USD method and adds a disabled Naira method. If no USD method exists, it creates a disabled one as well.
2. Open **Naira · Bank transfer, card & USSD**.
3. Enter your selling exchange rate in **NGN per $1**. For example, entering `1500` means a $10 order charges ₦15,000. This is an EXAMPLE, not a live exchange-rate recommendation. No rate is selected for you.
4. Enable the Naira method and save. Enable the USD method if required. The same settings govern cart checkout and wallet funding.
5. In Flutterwave's payment-method settings, turn OFF **Enable Dashboard Payment Options** (the setting that overrides per-payment `payment_options`). Allow the API request to control displayed methods. Consult https://developer.flutterwave.com/docs/payment-methods if your dashboard labels differ.
6. Confirm your account supports NGN card/bank-transfer/USSD and USD card collections. The application cannot grant currency or method approvals that Flutterwave has not enabled.
7. Open the cart or Wallet & billing. You should see **Pay in Naira** and **Pay in USD** as separate cards. Test both through Flutterwave test mode before production use; keep test/live keys and webhook secrets matched.

The rate is managed manually by the administrator, not fetched from an exchange-rate service. Check and update it as needed. Customers see the current estimate before creating a payment and the actual charge at Flutterwave. Each payment snapshots its currency, amount and rate when created. Rate changes affect new payments only. Existing invoice links are not regenerated and may retain their old provider options.

## Verification and accounting

Prices, wallet balances, revenue and ledger entries remain in USD cents. An NGN payment stores a separate exact charge amount in naira, plus the NGN-per-USD rate. Wallet funding still asks for the USD amount to credit and previews the corresponding NGN charge.

The server checks the provider's transaction ID, internal reference, currency, exact expected amount and successful status. It never credits NGN as USD. Repeated callbacks settle a payment once. Pending orders are delivered through the existing inventory/manual delivery rules. A browser redirect alone does not settle a payment.

Admin transactions and customer orders/wallet payments show the NGN charge alongside the USD amount. The payment verification control works for either Flutterwave choice. NOWPayments is unchanged.

## Checks

- TypeScript and production build.
- 18 unit tests, including fixed-point conversion and invalid rates.
- 21 database integration tests using isolated PGlite, including both Flutterwave checkout payloads, locked exchange rates, wrong currency, underpayment, ownership/reference mismatch, duplicate callbacks, NGN order delivery state and USD wallet credit.
- Existing HTTP authorization/session checks, plus admin rate validation and public payment-method visibility.
- Provider calls mocked; no real charges, live migration or AWS deployment performed. Flutterwave's real available payment methods must be confirmed in your account after deployment.
