# PawPIM

A lightweight Product Information Management (PIM) tool for WooCommerce. It imports products from a store, scores each one for data quality, uses Claude to suggest fixes, shows a field-by-field diff against the live store, pushes only what you approve, and can undo any push.

> The app was first called SmartPIM. The folder, the database file (`smartpim.db`) and the `SMARTPIM_DB` variable keep that name so nothing existing breaks.

Built solo for a 4-hour hackathon (challenge **Option B: PIM System Integration with WooCommerce**), then extended into a full dashboard with a demo store.

## Contents

1. [Context and goals](#context-and-goals)
2. [Features](#features)
3. [Tech stack](#tech-stack)
4. [Architecture](#architecture)
5. [Document structure](#document-structure)
6. [Quick start](#quick-start)
7. [Choosing the store and the AI](#choosing-the-store-and-the-ai)
8. [Configuration](#configuration)
9. [How it works](#how-it-works) (quality score, stock, sync states, revert, CSV, database)
10. [API reference](#api-reference)
11. [Demo script](#demo-script)
12. [Verification](#verification)
13. [Known limits](#known-limits)
14. [Photo credits](#photo-credits)

## Context and goals

Online stores accumulate product data that is incomplete or inconsistent: missing descriptions, no attributes, no images, stale stock. Fixing it by hand takes hours, and tools that "fix it with AI" often invent facts.

PawPIM sits between a team and their WooCommerce store and follows four rules:

- **Real two-way integration.** Products, categories, stock and orders come from the WooCommerce REST API (v3). Changes go back through the same API.
- **AI that asks instead of inventing.** Every suggestion is labelled `existing data`, `AI-inferred` or `unknown`. Anything Claude cannot derive from the product becomes a question for you, never a guess.
- **A human approves every change.** Nothing reaches the store until you review a diff and push it.
- **Everything is reversible and visible.** Each push is logged with its exact payload and the store's previous values, and can be reverted in one click. A mock store is always labelled as a mock.

The demo store is **PawNest**, a cat and dog shop with 15 products, about 170 sample orders over 60 days, prices in Indian rupees and its own storefront theme.

## Features

| Page | What it does |
|---|---|
| **Overview** | Greeting, revenue and orders sparklines, KPIs (average quality, low and out-of-stock counts, stock value), stock alerts, products needing attention, recent syncs, and a **View live store** button. |
| **Product catalog** | Search, filter (category, quality, stock, sync status) and 6 sorts. Add, edit and delete products, manage attributes and stock. **Check sync** compares every product with the store. **Import from WooCommerce** merges and keeps your unsynced edits. **Bulk edit** (tick products): set category, change price by a percentage, set stock, then push. **CSV** menu: export, and import with a preview. |
| **Product detail** | Editor with live score, issue list, **Generate suggestions** (Claude), accept / edit / reject cards, diff against the live store, push of the ticked fields, and **Create in WooCommerce** for new products. |
| **AI Enrich** | One click reviews the whole store. Claude suggests fixes for every product with issues. Edit or untick any suggestion, then **Approve all changes** (saved locally) and **Push to WooCommerce**. |
| **Analytics** | Orders and sales from WooCommerce for 7, 30 or 60 days: revenue, orders, average order value, units, change versus the previous period, top products, revenue by category and city, order statuses, and a restock list based on sales pace and current stock. |
| **Sync log** | Every push with its exact payload, the store's values from before it, latency and result. **Revert** restores the previous values. |
| **Integrations** | Live connection checks for WooCommerce and the AI provider. |

Also: new categories are created in the store on push, stock is tracked and pushed both ways, image URLs are validated before WordPress rejects them, and the offline demo data lets the app run with no store at all.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Client | React 19, TypeScript, Vite 8 | Fast scaffold and hot reload. Routing is a small hash router in `App.tsx`. |
| Styling | Tailwind CSS v4 (Vite plugin), Inter font | Quick, consistent, flat UI. Colors and radii are in `index.css`. |
| Icons and charts | `lucide-react`; hand-written SVG charts (`Charts.tsx`) | No chart library to bundle. |
| Server | Node.js, Express 5, TypeScript, run with `tsx` | Keeps secrets server-side, one language end to end. |
| Database | SQLite through Node's built-in `node:sqlite` (WAL mode) | Zero setup, no native build, real transactions. Needs Node 22.13 or newer. |
| Store integration | WooCommerce REST API v3 | The required target. Auth by Basic header over HTTPS, query-param keys on a local HTTP store. |
| AI | Claude through the Claude Code CLI (`claude -p`) or the Anthropic SDK (`@anthropic-ai/sdk`) | The CLI uses an existing Claude login, so no API key is needed. A labelled rule-based fallback runs with neither. |
| Shared code | `shared/*.ts`, imported by both client and server | One quality-scoring function, so both sides always agree. |
| Demo stores | Docker (MariaDB, WordPress, WooCommerce, the PawNest theme) and a built-in mock WooCommerce server | A real store to demo against, and a no-Docker fallback. |
| Linting and types | `tsc` on both sides, `oxlint` on the client | |

## Architecture

```
                         /api (Vite proxy)                    REST v3
React + Vite client  ───────────────────────►  Express API  ───────────────►  WooCommerce
  localhost:5173                                localhost:3001   │               ├─ Docker store   localhost:8080
                                                                 │               └─ Mock store     localhost:8081
                                                                 ├────────────►  Claude (CLI or API)
                                                                 └── SQLite  server/data/smartpim.db
```

- The browser never sees WooCommerce or AI credentials. The server holds them in `server/.env`.
- The server keeps a local working copy of the catalog in SQLite. Edits go to the copy first (`syncStatus: modified`). Only an explicit push sends them to the store.
- `shared/quality.ts` is a pure function used by the server (API responses) and the client (live score while typing).

## Document structure

```
KILOWOTT/smartpim/
├── README.md                    this file
├── docker-compose.yml           MariaDB + WordPress (port 8080) + a wp-cli helper profile
├── .env.example                 Docker store passwords (copy to .env; .env is git-ignored)
├── .gitignore
│
├── client/                      React app (Vite, port 5173, proxies /api to 3001)
│   ├── index.html, vite.config.ts, tsconfig*.json, .oxlintrc.json, package.json
│   ├── public/                  favicon.svg, logo-mark.svg
│   └── src/
│       ├── main.tsx, App.tsx    entry, hash router, sidebar, mobile header, store-status chip
│       ├── index.css            Tailwind import, .card, base colors, focus rings
│       ├── pages/               Overview, Catalog, ProductDetail, NewProduct, AiEnrich,
│       │                        Analytics, SyncLog, Integrations
│       ├── components/          Logo, ScoreBar (+ Thumb), StockBadge, Toaster, Charts
│       │                        (AreaChart, BarList, Donut, Sparkline), CsvImport (import preview dialog)
│       └── services/            api.ts (all API types and calls), money.ts (INR format), toast.ts
│
├── server/                      Express API (port 3001) and the mock store
│   ├── package.json, tsconfig.json, .env.example   (.env and .env.docker-woo are git-ignored)
│   ├── src/
│   │   ├── index.ts             app setup (CORS for localhost, JSON limit, error handler)
│   │   ├── routes/api.ts        every /api route
│   │   └── services/
│   │       ├── db.ts            opens the SQLite database, creates tables, transaction helper
│   │       ├── store.ts         product and log persistence, one-time import of old JSON files
│   │       ├── synclog.ts       sync log reads and writes, revert marking
│   │       ├── woocommerce.ts   REST client, product mapping, push, create, orders
│   │       ├── claude.ts        suggestions and the store-wide review (CLI or SDK)
│   │       ├── demo.ts          rule-based fallback suggestions (labelled "not from Claude")
│   │       ├── analytics.ts     sales analytics from orders
│   │       └── csv.ts           CSV parser and writer
│   ├── mock/
│   │   ├── mock-woo.ts          mock WooCommerce REST server and storefront (port 8081)
│   │   └── images/              15 product photos (jpg), also served at /api/img/*
│   └── data/                    git-ignored runtime data
│       ├── smartpim.db          the database (plus -wal and -shm files while running)
│       ├── mock-woo.json        mock store state
│       └── legacy-json/         old products.json and sync-log.json, kept as a backup
│
├── shared/                      code and data used by client, server and scripts
│   ├── quality.ts               Product and Suggestion types, scoreProduct (8 checks)
│   ├── stock.ts                 LOW_STOCK threshold and stockState
│   ├── catalog.json             the PawNest catalog (single source for mock, Docker seed, offline demo)
│   └── productImage.ts          legacy SVG illustrations (the /api/img/*.svg routes)
│
├── scripts/                     store setup (bash and PHP)
│   ├── setup-store.sh           bring up Docker, install WooCommerce, create API keys
│   ├── reset-docker-store.sh    reseed products, orders and theme from shared/catalog.json
│   ├── seed.php                 the seeder run inside WordPress
│   ├── install-theme.sh         copy store-theme/pawnest into the container and activate it
│   ├── use-store.sh             switch server/.env between the mock and Docker store
│   └── local-dev-ssl.php        local-only plugin so Woo accepts API keys over plain HTTP
│
├── store-theme/pawnest/         the PawNest WordPress theme (style.css, functions.php,
│                                header, footer, index, front-page, woocommerce templates)
└── docs/PawPIM_Implementation_Plan.md   the original plan written before the build
```

## Quick start

Requires Node 22.13 or newer (developed on Node 25). The built-in `node:sqlite` module is used, so there is nothing native to compile.

```bash
# 1. install
cd server && npm install && cd ../client && npm install && cd ..

# 2. configure (points the app at the built-in mock store)
cp server/.env.example server/.env
scripts/use-store.sh mock

# 3. run (three terminals)
cd server && npm run mock-woo      # mock WooCommerce on :8081
cd server && npm run dev           # PawPIM API on :3001
cd client && npm run dev           # UI on http://localhost:5173
```

Open http://localhost:5173, click **Import from WooCommerce**, then **Start** on the Orthopedic Dog Bed card.

Type-check and build:

```bash
cd server && npm run build         # tsc --noEmit
cd client && npm run build         # tsc -b && vite build
```

## Choosing the store and the AI

**Store**

| Option | How | Notes |
|---|---|---|
| **Mock store** | `scripts/use-store.sh mock` | Simulated WooCommerce REST API on `:8081` with the 15 PawNest products, photos, a generated 60-day order history and a themed storefront at http://localhost:8081. The Integrations page labels it as a mock. |
| **Local real WooCommerce** | Copy `.env.example` to `.env`, then `docker compose up -d` and `scripts/setup-store.sh` | WordPress + WooCommerce + the PawNest theme on `:8080`. Writes the API keys into `server/.env`. Needs Docker (about 700 MB of images). Rebuild later with `scripts/reset-docker-store.sh`, which deletes existing products and orders and reseeds them. |
| **Your own store** | Set the three `WOOCOMMERCE_*` variables | Create REST keys under WooCommerce, Settings, Advanced, REST API (Read/Write). Use HTTPS. |

Switch between the mock and Docker stores with `scripts/use-store.sh mock|docker`, then restart the server. Reset the mock to its starting data with `curl -XPOST localhost:8081/__reset` and import again.

**AI**

| Option | Settings | Notes |
|---|---|---|
| **Claude API** | `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` | API access is billed separately from a Claude subscription. |
| **Claude Code CLI** | `AI_PROVIDER=claude-cli` | Uses your own Claude Code login, no API key. Install with `npm i -g @anthropic-ai/claude-code`, run `claude` once to log in. About 10 to 30 seconds per request and counts against your plan limits. Set `CLAUDE_BIN` if `claude` is not on your PATH. |
| **Neither** | nothing | The app offers rule-based **demo suggestions**, labelled "not from Claude". |

## Configuration

`server/.env` (git-ignored, never sent to the browser):

```dotenv
PORT=3001
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
AI_PROVIDER=                 # claude-cli to use the local Claude Code login
CLAUDE_BIN=                  # optional path to the claude binary
WOOCOMMERCE_STORE_URL=       # e.g. http://localhost:8081
WOOCOMMERCE_CONSUMER_KEY=
WOOCOMMERCE_CONSUMER_SECRET=
SMARTPIM_DB=                 # optional database path (default server/data/smartpim.db)
```

## How it works

### Quality score

Eight equal-weight checks; score = passed / 8. The rules live in [shared/quality.ts](shared/quality.ts).

| Check | Passes when |
|---|---|
| SKU | present |
| Name | at least 3 characters |
| Description | at least 80 characters |
| Short description | present |
| Price | a number greater than 0 |
| Category | assigned |
| Attributes | a Material plus at least one more attribute |
| Image | at least one image URL |

Bands: **Good** 85% and above, **Needs work** 50 to 84%, **Poor** below 50%.

### Stock

Stock is per product (blank means not tracked) and maps to WooCommerce `manage_stock` and `stock_quantity`. **5 units or fewer is low stock**; 0 is out of stock. Stock is read from, and pushed to, the store.

### Sync states

Each local product has a `syncStatus`: `synced` (matches the last pull or push), `modified` (edited locally, not pushed), `error` (the last push failed) or `never` (local only). **Check sync** compares every product with the live store and reports: in sync, local changes not pushed, changed in the store, missing from the store, new locally, or new in the store. **Import** is a merge: products with unsynced edits and new local products are kept, and a summary says what was added, refreshed, kept or removed.

Product ids: positive ids come from the store, negative ids are products created locally and not yet in the store (they get a real id when created), and ids 9000 and above are offline demo products that are never sent anywhere.

### Push, diff and revert

1. The product page diffs your version against the live store, field by field. You tick the fields to send.
2. A push reads the store's current values for those fields first, then sends the update. A category that does not exist yet is created.
3. The sync log keeps the payload and the previous values. **Revert** sends the previous values back and logs that as its own entry.

Revert applies to updates only (a created product is not deleted) and overwrites whatever the store has for those fields now.

### Bulk edit and CSV

- **Bulk edit:** tick products, choose set category, change price by % (-90 to +500) or set stock, then **Apply**. Changes are saved locally as `modified`. **Push to WooCommerce** sends only the fields that differ from the store, product by product, and one failure does not stop the others.
- **CSV export** columns: `sku, name, price, category, stock, description, short_description, image_url, attributes, id`. Attributes are written as `Name: Value | Name: Value`. Text cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets do not run them as formulas.
- **CSV import** matches rows by SKU (then id). Blank cells keep the current value. A preview lists every row as update, create, unchanged or error (with the reason) before you click Apply. Rows with errors are skipped. Up to 2000 rows.

### Database

`server/data/smartpim.db` (SQLite, WAL mode):

| Table | Holds |
|---|---|
| `products` | one row per product: fields, `attributes` as JSON, `sync_status`, `pos` (display order), `updated_at` |
| `sync_log` | one row per push: payload, `before` values, result, latency, `reverted`, `revert_of`. The latest 200 are kept. |

Each product is saved on its own, so an edit made while another product is mid-push is never lost. Multi-row changes (import, reset, bulk edit, CSV apply) run in one transaction. On first start, any old `products.json` and `sync-log.json` in `server/data/` are imported once.

### Security and robustness

- Secrets stay in `server/.env`. The API accepts requests only from `localhost` origins.
- Request fields are whitelisted and length-limited; prices, stock and image URLs are validated.
- AI output is treated as data: suggestions are validated before they reach the client and are never applied automatically.
- Errors from WooCommerce (status and message) are shown in the UI. If the server restarts, the UI says so instead of showing a bare 502.

## API reference

All routes are under `/api`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Server up check |
| GET | `/integrations/status` | Live check of WooCommerce and AI configuration |
| GET | `/products`, `/products/:id` | Products with quality score |
| POST | `/products` | Create a local product (negative id until created in the store) |
| PUT | `/products/:id` | Save local edits (whitelisted, length-limited) |
| DELETE | `/products/:id` | Delete a product that was never created in the store |
| POST | `/products/import` | Merge the store's products into the local copy |
| POST | `/products/demo` | Load 4 offline sample products (never sent to a store) |
| GET | `/sync-check` | Compare every product with the live store |
| GET | `/products/:id/diff` | Local vs live store |
| POST | `/products/:id/push` | Push the approved fields, or create the product if it is new |
| POST | `/products/push-bulk` | `{ids}`: push each product's changed fields |
| POST | `/products/bulk` | `{ids, category?, pricePct?, stock?}`: local bulk edit |
| GET | `/products/export.csv` | Catalog as CSV |
| POST | `/products/import-csv[?dryRun=1]` | Body is CSV text (`text/csv`); previews or applies it |
| POST | `/ai/suggest` | Claude suggestions for one product |
| POST | `/ai/review` | Batched review of every product with issues (`{demo:true}` for the rule-based version) |
| POST | `/ai/demo-suggest` | Rule-based suggestions (not Claude) |
| GET | `/analytics?days=7\|30\|60` | Sales analytics computed from WooCommerce orders |
| GET | `/sync-log` | Every push with payload, previous values, mode and latency |
| POST | `/sync-log/:id/revert` | Restore the store to its values from before a logged update |
| POST | `/reset` | Reset the mock store and re-import (refuses on a real store) |
| GET | `/img/*` | Product photos |

## Demo script

About 3 minutes:

1. Catalog: import, point at the low scores.
2. Open the **Orthopedic Dog Bed** (DOG-104, 63%) and show its issues.
3. **Generate suggestions.** Note the source labels and the questions Claude asks instead of guessing.
4. Edit the description, accept the suggestions, answer the questions you know. The score climbs live.
5. **Review changes vs live store**, tick the fields, **Push**.
6. Open the **Sync log**, click **View payload**, then **Revert** to show the store return to its old values.
7. Refresh the store page (http://localhost:8080, or 8081 for the mock) to see the change.

Extra beats: **AI Enrich** (review the whole store, approve all), **Analytics**, **bulk edit** a price by 10% then push, **CSV** export and import preview.

## Verification

Tested end to end against the real Docker store:

- Import, Claude suggestions, accept, diff, push, sync log, storefront refresh.
- Stock round trip, add product (created in the store, then removed), attribute add / edit / remove, category creation on push.
- Revert: price change pushed and reverted, live value restored, a second revert refused.
- CSV: export then re-import reports every row unchanged; bad prices, bad stock, duplicate SKUs and short names are rejected with reasons.
- Bulk edit and bulk push from the UI.
- Drift detection and merge-safe import, plus 8 input-validation edge cases.
- Analytics totals match direct REST queries (74 orders, ₹1,58,011, 340 units over 30 days).
- SQLite: old JSON migrated with identical order and content; 12 parallel edits all kept; an edit made during a push was kept.
- All 8 pages load with no console errors, no overflow and no broken images; no gradients anywhere.

There is no automated test suite yet.

## Known limits

- No login and no multi-user support. The server is meant to run as one process.
- AI Enrich results live in the browser tab and are lost on a full page reload.
- Last writer wins if two browser tabs edit the same product.
- Revert covers updates only, and overwrites the store's current values for those fields.
- Product images are never uploaded, only referenced by URL. The link must be public and end in `.jpg`, `.jpeg`, `.png`, `.gif` or `.webp` (WordPress rejects extensionless links such as raw Unsplash URLs).
- Variable products (sizes, colors) and multiple categories per product are not supported; only the first category is read.
- Import reads up to 50 products per call (no pagination yet), and analytics reads up to 1000 orders.
- Orders in the demo store are generated sample data.
- The Docker store runs a local-only plugin (`local-dev-ssl.php`) so WooCommerce accepts API keys over plain HTTP. Do not copy it to a real store.
- The suggestion step sends the product's data to the AI provider you configure. Review suggestions before accepting, as with any AI output.
- Stock photos are lifestyle shots, not product packshots.

## Photo credits

The 15 product photos (mock store and Docker store) are from [Unsplash](https://unsplash.com) (free to use under the Unsplash License) and live in `server/mock/images/`. They are sample images for the demo only. The photos were picked from Unsplash search results for each product type, and the photographers' names were not recorded. Add attribution before any public release.
