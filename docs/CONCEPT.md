# Financial Adviser — Concept & Architecture

A personal finance dashboard: upload your monthly credit card statement, see
where your money goes, and get concrete suggestions for where you can save.

## 1. Core user flow

1. **Upload** a statement (CSV or PDF export from the credit card company).
2. **Parse & normalize** the transactions (date, merchant, amount, currency).
3. **Categorize** each transaction (groceries, subscriptions, dining, travel, …).
4. **Visualize** spending: category breakdown, month-over-month trends, top merchants.
5. **Advise**: highlight savings opportunities (recurring subscriptions, unusually
   high categories, fees, duplicate charges).

## 2. Key design decisions

### 2.1 Ingestion: start with CSV, add PDF later

- Almost every bank/card provider offers a **CSV export**. CSV parsing is
  reliable and takes a day to build; PDF parsing is fragile and
  provider-specific.
- **MVP:** CSV upload with a small mapping step ("which column is the date /
  amount / description?"). Save the mapping per provider so the second upload
  is one click.
- **Later:** PDF statements via text extraction (e.g. `pdf-parse` /
  `pdfplumber`) with per-provider templates, or an LLM-assisted extractor.
- **Much later (optional):** direct bank connections via open-banking APIs
  (e.g. GoCardless Bank Account Data, Tink, Plaid) — powerful but brings
  compliance and cost overhead. Not needed to validate the idea.

### 2.2 Categorization: rules first, LLM as fallback

1. **Rule engine:** a merchant-keyword table (`REWE|EDEKA|ALDI → Groceries`,
   `NETFLIX|SPOTIFY → Subscriptions`). Covers ~80% of transactions and is
   instant, free, and predictable.
2. **User overrides:** when the user re-categorizes a transaction, store a new
   rule so it sticks for future uploads.
3. **LLM fallback:** send only the *uncategorized* merchant strings (not full
   statements) to the Claude API with a fixed category list and structured
   output. Cheap, and accuracy is excellent for merchant classification.

### 2.3 Privacy: local-first

Financial data is sensitive, so the app is **self-hosted on the user's own
server** — concretely: a Docker container deployed as a Custom App on
**TrueNAS SCALE**.

- All data in a **SQLite** database on a TrueNAS dataset — no cloud storage,
  and TrueNAS snapshots/replication give free backups.
- The only outbound traffic is the optional LLM categorization fallback, and
  even that sends merchant names only.
- **User login is required** (the app is reachable by everyone on the LAN):
  username/password accounts with session cookies via Auth.js. Registration is
  disabled — an admin creates accounts. Each user (or shared household
  account) sees only their own statements and transactions.
- Still no public-internet exposure: for access from outside the home network,
  use a VPN (TrueNAS has built-in WireGuard/Tailscale apps) rather than port
  forwarding.

### 2.4 Deployment on TrueNAS SCALE

1. The app ships as a single **Docker image** (multi-stage build, `next build`
   → standalone output), published to GitHub Container Registry via a GitHub
   Action.
2. On TrueNAS SCALE (Electric Eel and later run Docker natively): **Apps →
   Custom App**, point it at the image, map a host path (dataset) to
   `/data` for the SQLite file and uploaded statements, expose one port.
3. Optional: HTTPS + nice hostname via a reverse proxy app (Nginx Proxy
   Manager / Traefik) on the NAS.
4. Updates = push a new image tag, hit "update" in the TrueNAS UI.

### 2.5 Tech stack (recommendation)

| Layer | Choice | Why |
|---|---|---|
| App framework | **Next.js (TypeScript)** | One codebase for UI + API routes (upload, parsing); single Docker image |
| Auth | **Auth.js** (credentials provider) | Simple username/password login with session cookies; no external identity provider needed |
| Database | **SQLite** via Drizzle ORM | Zero-setup, ideal for a handful of household users; lives on a TrueNAS dataset |
| CSV parsing | **Papa Parse** | Robust, handles delimiter/encoding quirks |
| Charts | **Recharts** | Simple declarative charts for the dashboard |
| Styling | **Tailwind CSS** | Fast to build a clean dashboard UI |
| LLM fallback | **Claude API** (structured output) | Merchant → category classification |

A Python backend (FastAPI + pandas) would also work well — pick it if you are
more comfortable in Python. The recommendation above optimizes for a single
codebase and easy UI iteration.

## 3. Data model (minimum)

- **users** — id, username, password_hash (argon2/bcrypt), role (admin/user)
- **statements** — id, user_id, provider, period (month), uploaded_at, source filename
- **transactions** — id, statement_id, date, merchant (raw + normalized),
  amount, currency, category_id, is_recurring
- **categories** — id, name, icon/color, budget (optional)
- **rules** — id, pattern (keyword/regex), category_id, created_by (system/user)
- **provider_mappings** — id, provider, column mapping for CSV import

## 4. Dashboard views

1. **Monthly overview:** total spend, delta vs. previous month, donut chart by
   category, top 5 merchants.
2. **Trends:** stacked bar per month by category, per-category line charts.
3. **Recurring costs:** auto-detected subscriptions (same merchant, similar
   amount, ~monthly cadence) with annual cost projection — this is the single
   most actionable "where can I save" feature.
4. **Insights / advice:** rule-generated findings such as
   - "Subscriptions total €62/month (€744/year) — here are the 6 charges."
   - "Dining out is 40% above your 6-month average."
   - "You paid €12 in foreign-transaction fees this month."

## 5. Roadmap

| Phase | Scope |
|---|---|
| **1 — MVP** | User login (Auth.js, admin-created accounts), CSV upload + column mapping, rule-based categorization, monthly overview dashboard, transaction list with manual re-categorization; Dockerfile + deploy as TrueNAS Custom App |
| **2 — Insights** | Recurring-charge detection, month-over-month trends, insight cards, budgets per category |
| **3 — Smarter input** | LLM categorization fallback, PDF statement import, multi-account support |
| **4 — Optional** | Bank API integration, public hosted version (encryption at rest, GDPR, open registration) |

## 6. Risks & gotchas

- **PDF parsing** is the biggest time sink — that's why it's phase 3, not 1.
- **Amount signs and formats** differ per provider (debit positive vs.
  negative, `1.234,56` vs `1,234.56`) — normalize at import, store integer
  cents.
- **Category taxonomy:** keep it small (10–15 categories). Too many categories
  makes both the charts and the auto-categorization worse.
- **Advice quality:** start with transparent rule-based insights; users trust
  "Netflix + Spotify + iCloud = €31/month" more than opaque AI suggestions.
