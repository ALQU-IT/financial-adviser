# Financial Adviser

A self-hosted spending dashboard. Upload your monthly credit card statement
(CSV), see where your money goes — by category, merchant and month — and spot
where you can save.

See [docs/CONCEPT.md](docs/CONCEPT.md) for the full concept and roadmap.

## Features (Phase 1)

- 🔐 **User login** — session-based auth; the first visit creates the admin
  account, the admin adds further users. Each user sees only their own data.
- 📄 **CSV import wizard** — auto-detects the date/description/amount columns,
  date format (`31.01.2026`, `2026-01-31`, …), number format (`1.234,56` and
  `1,234.56`) and sign convention; column settings are saved per provider.
- 🏷️ **Automatic categorization** — keyword rules (German + international
  merchants included). Re-categorizing a transaction creates a personal rule
  that also applies to future imports.
- 📊 **Dashboard** — monthly spend with month-over-month change, spending by
  category, 6-month trend, top merchants, uncategorized-review counter.
- 🗑️ **Safe imports** — delete a statement to remove all of its transactions
  if an import went wrong.

All data lives in a single SQLite database — no cloud, no third-party services.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the first visit takes you to `/setup` to create
the admin account. Data is stored in `./data/finance.db` (override with the
`DATA_DIR` env var).

## Deployment on TrueNAS SCALE

1. Build/publish the image (the included GitHub Action publishes
   `ghcr.io/<owner>/financial-adviser:latest` on every push to `main`), or
   build locally: `docker build -t financial-adviser .`
   The container runs as UID/GID **568:568** (the TrueNAS `apps` user) — give
   it the data dataset once: `chown -R 568:568 /mnt/<pool>/<dataset>`
   (otherwise the app fails with `SQLITE_CANTOPEN: unable to open database
   file`).
2. In TrueNAS: **Apps → Discover Apps → ⋮ → Install via YAML** and paste
   [docker-compose.yaml](docker-compose.yaml) (adjust the host path and port),
   or configure the same values manually via **Custom App**:
   - **Image:** `ghcr.io/<owner>/financial-adviser:latest`
   - **Port:** map container port `3000` to a free host port
   - **Storage:** mount a dataset (host path) at `/data` — this holds the
     SQLite database; snapshot/replicate it for backups
3. Open `http://<nas-ip>:<port>`, create the admin account, done.

### HTTPS (self-signed)

The compose file includes a Caddy sidecar that serves the app at
`https://<nas-ip>:3443` with a self-signed certificate from its own local CA
(auto-generated, auto-renewed, persisted in the `caddy_data` volume).
Port `3001` redirects to HTTPS, the app publishes no plain-HTTP port itself,
and the session cookie is marked `Secure` (`COOKIE_SECURE=true`).

**Trusting the certificate (optional):** browsers warn about self-signed
certs. To remove the warning, export Caddy's root CA once and import it on
your devices (Settings → Certificates → Trusted Roots, or the keychain):

```bash
docker cp financial-adviser-tls:/data/caddy/pki/authorities/local/root.crt .
```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | `/data` (Docker) / `./data` (dev) | Where the SQLite db is stored |
| `COOKIE_SECURE` | unset | Set to `true` when serving via HTTPS |
| `NEXT_PUBLIC_CURRENCY` | `EUR` | Display currency |

> **Note:** keep the app LAN-only and use your VPN (WireGuard/Tailscale) for
> remote access. Don't port-forward it to the internet without an extra auth
> layer in front.

## License

GPL-3.0 — see [LICENSE](LICENSE).
