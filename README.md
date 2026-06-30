# Sim GTM Agent

A working go-to-market agent that finds Sim's enterprise customers, scores them against Sim's ICP, and drafts the first outreach.

It enriches each company through **Clay** — run as an MCP server inside a single Claude call — scores it against a 7-category, 100-point rubric tuned to Sim's enterprise-compliance ICP, and writes a ready-to-send cold email for every account that qualifies.

**Live demo → https://sim-gtm-agent.netlify.app**

The 36 accounts in the app are real output from live runs, not mock data: Sim's most reachable enterprise-compliance fits, each carrying the signals behind its score and a drafted email.

---

## What this gives Sim

A ranked, ready-to-action account list:

- **36 companies** scored against Sim's enterprise ICP, sorted by fit.
- **2 Tier A and 18 Tier B** — 20 accounts a rep could open this week, each with a personalized draft already written.
- Every score **shows its work**: a 7-category breakdown citing the specific signal it found (headcount, compliance posture, identity provider, AI hiring, the orchestration tool already in their stack).
- **6 disqualified**, with reasons, so no one spends a touch on a bad fit.

The list isn't cherry-picked. The spread — scores from 25 to 95, six disqualifies — is what an honest pass at a market actually looks like.

---

## The ICP it scores against

Sim sells an open-source, self-hostable agent workspace, so the buyers who feel the most pain are regulated teams that can't put PHI or financial data into a closed SaaS tool, and teams already orchestrating agents on something they'd want to replace.

The rubric encodes exactly that — 7 categories, 100 points:

| Category | Max | Top band |
|---|---|---|
| Industry | 20 | Healthcare / health-tech, or fintech / insurtech |
| Size | 10 | 200–5,000 employees |
| Compliance | 20 | HIPAA or HITRUST (SOC 2 Type II next) |
| Identity / SSO | 10 | Okta or Azure AD (Entra) |
| AI footprint | 15 | Active AI hiring *and* shipped AI tooling |
| Displacement | 15 | Already running n8n / Zapier / Make (or LangChain) |
| Compliance hiring | 10 | Open GRC / security / AI-governance role |

Tiers: **A ≥ 85, B ≥ 70, C ≥ 50, Disqualify < 50.** A draft is written only when an account clears **70**, so reps only ever see drafts for accounts worth contacting.

The "Displacement" category is the sharp one for an orchestration product: a company already wiring agents together on n8n or LangChain has the problem Sim solves and a stack to migrate off.

---

## How it works

The intelligence runs inside one Anthropic API call. The backend attaches Clay as an MCP server; Claude runs Clay's enrichment tool loop server-side, then scores the result against the rubric and returns clean JSON.

```
Browser (React / Netlify)
      │  POST /enrich { domain }
      ▼
Backend (Express / Render)
      │  Anthropic Messages API  ──  mcp_servers: [ Clay ]
      ▼
Claude runs Clay's tool loop server-side
   (enrich → firmographics, tech stack, hiring, compliance signals)
      │
      ▼
Score against the 7-category rubric → normalize → draft email if ≥ 70
      │
      ▼
{ company, scores{…}, icpScore, tier, email }  →  rendered in the table
```

The parts worth reading in `backend/server.js`:

- **Server-side MCP.** Clay is attached via `mcp_servers` with an `mcp_toolset` tool, on the current MCP connector beta. Claude runs the entire enrich-and-reason loop inside one call — no client-side tool orchestration.
- **Streaming, on purpose.** The response is read as an SSE stream. A single enrichment can run for minutes inside the MCP loop, and Node's `fetch` aborts a non-streamed request at roughly five minutes. Streaming keeps bytes flowing so that timeout never trips.
- **Resilient calls.** 429 and 529 are retried with `retry-after` and capped exponential backoff; thrown network errors retry too. A flaky run doesn't lose the batch.
- **Clay OAuth without babysitting.** Clay's access tokens expire hourly. The backend is seeded once with a refresh token and client ID (captured by `clay-auth.mjs`), then mints fresh access tokens on demand, caches them until just before expiry, and adopts Clay's rotated token if one comes back.

## Why the scores are trustworthy

The model proposes points; the server decides the number. In `normalizeResult`, each category is clamped to its max, any missing category defaults to 0, and **`icpScore` is the literal sum of the seven categories** — so the headline number can never disagree with the breakdown shown in the UI. Tiers derive from that sum, and a draft is attached only when it clears 70. There's no gap for a confident-but-wrong total to slip through.

---

## Live vs. snapshot

The deployed demo serves a **frozen snapshot** of a real run (`frontend/src/data/accounts.json`), so it loads instantly and costs nothing to browse. That's deliberate: a live full run calls a paid enrichment API and the Anthropic API once per company, at about two minutes each, so a public site shouldn't fire it on every visit.

The engine behind the snapshot is real and in this repo. With the backend deployed and Clay connected, the per-row **↺ re-score** runs a fresh enrichment live against `backend/server.js`. The snapshot is the output; the backend is the machine that produced it.

---

## Run it yourself

**Backend**
```bash
cd backend
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY
node clay-auth.mjs          # one-time: capture Clay refresh token + client_id
# paste CLAY_REFRESH_TOKEN and CLAY_CLIENT_ID into .env
npm start                   # http://localhost:3000
```

**Frontend**
```bash
cd frontend
npm install
cp .env.example .env        # VITE_BACKEND_URL=http://localhost:3000 for local
npm run dev
```

To deploy as-is: frontend on Netlify (base directory `frontend`), backend on Render. Set `ANTHROPIC_API_KEY`, `CLAY_REFRESH_TOKEN`, and `CLAY_CLIENT_ID` in the Render dashboard, and `VITE_BACKEND_URL` in Netlify. Secrets live in the host dashboards, never in git.

---

## Tech stack

- **Reasoning** — Claude via the Anthropic Messages API (`claude-sonnet-4-6`), with server-side MCP
- **Enrichment** — Clay, through its MCP server
- **Frontend** — React + Vite, hosted on Netlify
- **Backend** — Node + Express (ESM), hosted on Render
- **Auth** — Clay OAuth, refresh-token based and auto-renewing

---

## Notes

This is an independent demonstration build targeting Sim's published ICP. It is not affiliated with or endorsed by Sim. The company data shown comes from public signals surfaced during enrichment; no personal contact data is stored in this repo.

Built by Aakash Sethi — [LinkedIn](https://linkedin.com/in/aakash-sethi)
