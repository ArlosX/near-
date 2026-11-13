# Free Render deployment

Deploy the existing Node service and frontend together. Keep the existing Supabase PostgreSQL database and private evidence bucket. No framework migration, paid disk or new database is required.

## Create the service

1. Register at https://dashboard.render.com/register using GitHub
2. Choose New → Blueprint and connect `ArlosX/near-`, branch `main`
3. Review `render.yaml`: one Web Service, **Free** plan, no paid services
4. Supply `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your local environment privately in Render. Do not upload the whole `.env.local`
5. Under the service's Environment → Secret Files, add `prod-ca-2021.crt` with the contents of your Supabase CA certificate. The blueprint uses `/etc/secrets/prod-ca-2021.crt`. If initial startup preceded this upload, deploy again after saving
6. Wait for Live, then open the service's `https://…onrender.com` URL

For manual New → Web Service, use Node, root directory empty, build `npx --yes pnpm@11.25.0 install --frozen-lockfile`, start `npm start`, Free instance and health path `/api/health`. Copy the non-secret environment settings from `render.yaml` too.

Use the Supabase **Session pooler** connection string if direct IPv6 connectivity is unavailable. Keep TLS certificate verification enabled. The existing schema migrations 0004/0005 and private Storage bucket must already exist; startup does not run migrations.

## Origin and authentication

Render provides `PORT` and `RENDER_EXTERNAL_URL`. The service binds `0.0.0.0` and uses that exact HTTPS origin for wallet challenges, Host validation and Secure/HttpOnly/SameSite=Strict cookies. It does not trust client-supplied forwarded headers. For a future custom domain, explicitly set `PUBLIC_ORIGIN` to the exact HTTPS origin without a trailing slash, then reconnect the wallet.

Keep a single service instance: sessions are in memory. Sleeping, restarting or deploying can require wallet sign-in again. Orders and evidence remain in Supabase, not Render's ephemeral filesystem. The local key-free SQLite demo stays loopback-only; it is not the public server.

## Acceptance check after deployment

- `/api/health` returns 200; the landing page loads without errors
- Connect the intended Intear Testnet account; approve a sign-in message only
- Refresh and confirm the same account's orders and evidence load
- Disconnect; protected order requests must require sign-in again
- Check known historical receipts; do not send a new transaction just to test hosting

The HTTPS/proxy authentication path has automated local coverage. Real Render connectivity, TLS termination and wallet approval still require this deployment check.

## Scope and free-plan limits

Render Free sleeps after 15 minutes without inbound traffic; the next request can take about a minute to wake it. This is an idle timeout, not a 15-minute demo limit. Free quotas still apply. See https://render.com/docs/free

The public workspace displays evidence and prepares the existing workflow. Model execution and owner-signed TEE/settlement operations remain explicit local operator steps. Do not upload wallet private keys or pretend deployment makes the flow one-click. Model API keys are not needed merely to host this workspace.

Only the existing Supabase service credential belongs on the server. Never put it in browser code. No paid resources are provisioned by the blueprint.
