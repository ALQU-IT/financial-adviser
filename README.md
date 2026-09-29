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
   The app runs as UID/GID **568:568** (the TrueNAS `apps` user). The
   container fixes the data directory's ownership itself on start, so a
   dataset created by TrueNAS or Docker works as is; set `PUID`/`PGID` if you
   need a different user. Only a read-only mount (or NFS with `root_squash`)
   still needs a manual `chown -R 568:568 /mnt/<pool>/<dataset>` — the
   container log says so explicitly if that happens.
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
Plain `http://` — on port `3443` itself or on the old port `3001` — redirects
to HTTPS, the app publishes no plain-HTTP port itself,
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
| `CURRENCY` | `EUR` | Display currency (ISO 4217 code, e.g. `CHF`) |
| `PUID` / `PGID` | `568` | User the server runs as; the data directory is chowned to it |
| `RESET_2FA_USER` | unset | Clears that user's two-factor authentication on start (lockout recovery) — remove it again afterwards |
| `WEBAUTHN_RP_ID` / `APP_ORIGIN` | from the request | Override the hostname/origin security keys are bound to (rarely needed) |

### Two-factor authentication (optional)

Each user can turn it on under **account menu → Security & 2FA**; nobody is
forced to. Once on, signing in needs the password plus one of:

- **Authenticator app** (TOTP): Google/Microsoft Authenticator, 1Password,
  Bitwarden, Aegis, … — scan the QR code, confirm one code.
- **Security key or passkey** (FIDO2/WebAuthn): YubiKey, Windows Hello,
  Touch ID/Face ID, Android.
- **Recovery code**: 10 one-time codes are shown when you turn on your first
  method. Save them.

Turning a method off, removing a key or regenerating recovery codes asks for
the password again. Admins can **Reset 2FA** for another user on the Users
page.

**Security keys need a hostname and a trusted certificate.** Browsers refuse
WebAuthn on an IP address (`https://192.168.1.10:3443` won't work) and on
certificate warnings. So:

1. Reach the NAS by name — e.g. `https://truenas.local:3443` (mDNS works on
   most networks), or add a DNS entry in your router/Pi-hole such as
   `money.home.arpa` → NAS IP.
2. Trust Caddy's root certificate on each device (see above).
3. Register the key **while using that hostname**: a key is bound to the
   name it was registered on, and only works there.

The authenticator app works with any address, including the IP.

**Locked out** (lost phone/key *and* recovery codes)? Another admin can reset
it on the Users page. If you are the only admin, add
`RESET_2FA_USER: <your username>` to the app's environment, restart, sign in
with your password, then remove the variable and restart again.

> **Note:** keep the app LAN-only and use your VPN (WireGuard/Tailscale) for
> remote access. Don't port-forward it to the internet without an extra auth
> layer in front.

## License

GPL-3.0 — see [LICENSE](LICENSE).
