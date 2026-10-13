# PawPIM — Implementation Plan (original plan)

> This is the plan written before the build. The app grew beyond it (more pages, a demo store, analytics, SQLite). For what was actually built, see the [README](../README.md).

4-hour solo hackathon build. Challenge: **PIM System Integration with WooCommerce**.

---

## 1. Project summary

PawPIM is a lightweight Product Information Management tool that sits between a team and their WooCommerce store. It:

1. **Imports** real products from WooCommerce.
2. **Scores** each product for data quality with a transparent rule set.
3. **Enriches** incomplete listings with Claude, using only known facts.
4. **Shows a diff** of proposed changes against the live store product.
5. **Pushes** only the approved fields back to WooCommerce.

**Differentiators**
- Live two-way WooCommerce sync (pull, review, push).
- Fact-grounded AI: each suggestion is labelled `from existing data`, `inferred` or `unknown`. Unknowns become questions for the human, never guesses.
- Per-field diff-and-approve before anything touches the store.
- Honest status everywhere: a mock is always labelled as a mock.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite | Fast scaffold, hot reload |
| Styling | Tailwind CSS (Vite plugin) | Quick, consistent UI |
| Icons | Lucide React | Clean, no emoji |
| Backend | Node.js + Express (TypeScript) | Keeps secrets server-side |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) | Structured JSON output via tool use or JSON prompt |
| Integration | WooCommerce REST API v3 (`/wp-json/wc/v3`) | Required target |
| Persistence | JSON file on the server (or localStorage) | Zero setup; no SQLite unless time remains |
| Local store | LocalWP or Docker WordPress + WooCommerce | A live demo target |

**Secrets** live only in `server/.env`, which is git-ignored. Commit `server/.env.example` with blank placeholders:

```dotenv
PORT=3001
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
WOOCOMMERCE_STORE_URL=
WOOCOMMERCE_CONSUMER_KEY=
WOOCOMMERCE_CONSUMER_SECRET=
```

Choose `ANTHROPIC_MODEL` from a model your account can use (verify with one test call).

---

## 3. Architecture

```
┌──────────────┐   /api/*    ┌──────────────────┐  REST (Basic auth)  ┌────────────────┐
│ React client │ ──────────▶ │ Express server   │ ──────────────────▶ │ WooCommerce    │
│ (Vite, TS)   │ ◀────────── │                  │ ◀────────────────── │ store          │
└──────────────┘             │  - woo service   │                     └────────────────┘
                             │  - claude service│  Messages API       ┌────────────────┐
                             │  - quality rules │ ──────────────────▶ │ Anthropic      │
                             │  - JSON store    │ ◀────────────────── │ Claude         │
                             └──────────────────┘                     └────────────────┘
```

- The browser never sees Woo or Anthropic credentials.
- The quality scoring module is shared logic (a pure function), so the server and client produce the same score.

---

## 4. Screens (cut to three)

1. **Catalog** — table with name, SKU, category, price, quality score, sync status. Search plus filters (category, quality, sync). Header stat cards: total, needs attention, average completeness, pending sync. "Import from WooCommerce" button.
2. **Product detail** — editor, list of validation issues, "Generate suggestions" button, suggestion cards (accept, edit, reject), diff view against the live Woo product, "Push approved changes" button, result banner.
3. **Integrations** — WooCommerce connection status (real test call), Anthropic status, last sync results.

Skip separate Overview, AI Enrichment and Data Quality pages. Fold them into the three above.

---

## 5. Core workflow (the demo path)

```
Import from Woo
   → Catalog shows scores, sorted by lowest quality
   → Open "Coastal Canvas Backpack" (BAG-104, ~40%)
   → See issues: short description, no material, no weight
   → Click "Generate suggestions" (Claude)
   → Review cards: description (inferred), short description,
       category (from existing data), material (unknown → question)
   → Fill the unknown yourself, accept the rest
   → Score updates live (e.g. 40% → 90%)
   → Open diff: before (live Woo) vs after (approved)
   → Push → PUT /products/:id → success banner
   → Refresh the storefront page: the product is updated
```

---

## 6. Data model

```ts
type Product = {
  id: number;            // Woo product id
  name: string;
  sku: string;
  description: string;
  shortDescription: string;
  price: string;
  category: string;
  attributes: { name: string; value: string }[];
  imageUrl?: string;
  syncStatus: 'synced' | 'modified' | 'error' | 'never';
  lastSyncedAt?: string;
};

type Suggestion = {
  field: 'description' | 'shortDescription' | 'category' | 'attribute';
  attributeName?: string;
  value: string | null;
  source: 'existing_data' | 'inferred' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  question?: string;     // set when source === 'unknown'
  status: 'pending' | 'accepted' | 'rejected';
};
```

---

## 7. Quality scoring (documented rule)

Each check is worth equal weight; score = passed checks / total checks.

| Check | Passes when |
|---|---|
| SKU | present and non-empty |
| Name | at least 3 characters |
| Description | at least 80 characters |
| Short description | present |
| Price | valid number greater than 0 |
| Category | assigned |
| Required attributes | material and at least one more are present |
| Image | at least one image URL |

Status bands: **Good** at 85% or above, **Needs work** at 50–84%, **Poor** below 50%. Every failed check yields a plain-language message, such as "Add a description of at least 80 characters".

---

## 8. API design (server)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Server up check |
| GET | `/api/integrations/status` | Test Woo and Anthropic connectivity (real calls) |
| POST | `/api/products/import` | Pull products from Woo into the local store |
| GET | `/api/products` | List local products with scores |
| GET | `/api/products/:id` | One product |
| PUT | `/api/products/:id` | Save local edits |
| POST | `/api/ai/suggest` | Body: product. Returns `Suggestion[]` from Claude |
| GET | `/api/products/:id/diff` | Local vs live Woo version |
| POST | `/api/products/:id/push` | Push approved fields to Woo, return result |

---

## 9. AI design

- One call per product, server-side, returning strict JSON that matches `Suggestion[]`.
- **System prompt rules:** use only facts in the supplied product; never invent materials, dimensions, certifications or claims; if a value is unknown, return `value: null`, `source: "unknown"` and a `question` for the human.
- Validate the JSON before sending it to the client. On parse failure, retry once, then show an error.
- If no API key is set, the UI shows "AI unavailable — add ANTHROPIC_API_KEY". A demo mode, if added, is labelled "Demo suggestions (not from Claude)".

---

## 10. WooCommerce integration

- Base URL: `${WOOCOMMERCE_STORE_URL}/wp-json/wc/v3`.
- Auth: HTTP Basic with consumer key and secret over HTTPS. For a local HTTP store, the keys may need to go in query params, which is fine for local-only dev.
- Calls used: `GET /products?per_page=50`, `GET /products/:id`, `PUT /products/:id`, `GET /products/categories`.
- Push only the fields the user approved. Map category names to Woo category ids.
- Surface Woo errors (status and message) in the UI.

---

## 11. Folder structure (implement only what you need)

```
smartpim/
├── client/src/
│   ├── pages/        Catalog.tsx, ProductDetail.tsx, Integrations.tsx
│   ├── components/   ProductTable, ScoreBadge, SuggestionCard, DiffView, StatCard
│   ├── services/api.ts
│   └── types/product.ts
├── server/src/
│   ├── routes/       products.ts, ai.ts, integrations.ts
│   ├── services/     woocommerce.ts, claude.ts, quality.ts, store.ts
│   └── index.ts
├── server/.env.example
├── .gitignore
└── README.md
```

---

## 12. Schedule (4 hours)

| Time | Block | Output |
|---|---|---|
| 0:00–0:30 | Setup and risk check | Woo store running with API keys and 8–10 products (3–4 incomplete); Anthropic test call works; Vite client and Express server scaffolded; `/api/health` reachable |
| 0:30–1:20 | Catalog and scoring | Import from Woo, `quality.ts`, catalog table, search and filters, stat cards |
| 1:20–2:00 | Product detail | Editor, issue list, live score update, local persistence |
| 2:00–2:40 | AI enrichment | `/api/ai/suggest`, suggestion cards with accept, edit, reject, and unknown-field prompts |
| 2:40–3:20 | Diff and push | Diff view, approved-field push to Woo, success and error states, Integrations page |
| 3:20–3:30 | Buffer | Fix what broke |
| 3:30–4:00 | Demo prep | Rehearse the script, record a backup video, no new features |

**If you fall behind**, cut in this order: filters, stat cards, Integrations page polish, then bulk enrichment. Never cut import, scoring, AI suggestions, diff or push.

---

## 13. Stretch goals (only after the demo path works)

1. Bulk "Enrich all poor products" into a review queue.
2. Per-product activity log (field changed, by AI or human, timestamp).
3. CSV export.
4. Image previews.

---

## 14. Risks and fallbacks

| Risk | Mitigation |
|---|---|
| Woo store setup eats time | Use LocalWP; set up first; cap at 30 min |
| Woo REST auth fails on local HTTP | Use query-param keys locally, or enable pretty permalinks |
| Claude returns malformed JSON | Validate, retry once, show error |
| API key or network failure at demo | Pre-recorded backup video; labelled mock fallback |
| UI polish overruns | Use plain Tailwind defaults; one accent colour |

---

## 15. Definition of done

- [ ] App builds and runs with one command each for client and server
- [ ] Products import from the live Woo store
- [ ] Scores and issues are correct and update on edit
- [ ] Claude suggestions return with source labels and unknown-field questions
- [ ] Accept, edit and reject work; nothing is silently overwritten
- [ ] Diff view matches live Woo data
- [ ] Push updates the real product, and the storefront shows the change
- [ ] Integration status reflects real connectivity
- [ ] No secrets in the client bundle or the repo
- [ ] Demo script rehearsed, backup video recorded

---

## 16. Demo script (3–4 minutes)

1. **Problem (20s):** messy catalogs hurt listings and take hours to fix by hand.
2. **Catalog (30s):** import from Woo, show scores, point at the poor ones.
3. **Product (60s):** open the backpack, show the issues, generate suggestions, show the unknown-material question, answer it, accept the rest, watch the score rise.
4. **Diff and push (60s):** show before and after, push, refresh the live storefront.
5. **Close (20s):** "AI that asks instead of inventing, and a human approves every change that reaches the store."
