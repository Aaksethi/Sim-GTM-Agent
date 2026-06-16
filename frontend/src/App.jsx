import { useState } from 'react'
import axios from 'axios'
import RunButton from './components/RunButton'
import ProgressBar from './components/ProgressBar'
import ResultsTable from './components/ResultsTable'
import DownloadButton from './components/DownloadButton'
import accounts from './data/accounts.json'

// Backend endpoint. In production (Netlify) VITE_BACKEND_URL points at the
// deployed Render backend; locally it falls back to localhost.
const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const BACKEND_URL = `${API_BASE}/enrich`

// Pacing between domains on a full re-run, to stay under the Anthropic
// input-tokens-per-minute limit (~60s = one domain/min on a Tier 1 account).
const DELAY_BETWEEN_DOMAINS_MS = 60000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Enrich one domain via the backend and return a normalized row. Never throws —
// a failure comes back as a row with status 'Failed' so the table keeps going.
async function enrichOne(domain) {
  try {
    const { data } = await axios.post(BACKEND_URL, { domain })
    if (data && (data.company !== undefined || data.icpScore !== undefined)) {
      return {
        domain,
        company: data.company ?? domain,
        scores: data.scores ?? null,
        icpScore: typeof data.icpScore === 'number' ? data.icpScore : null,
        tier: data.tier ?? null,
        email: data.email && data.email.subject ? data.email : null,
        error: null,
        status: 'Done',
      }
    }
    const detail = data?.raw
      ? String(data.raw)
      : data?.error
        ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
        : 'No usable data returned'
    return { domain, company: domain, scores: null, icpScore: null, tier: null, email: null, error: detail, status: 'Failed' }
  } catch (err) {
    const detail = err?.response?.data?.error
      ? (typeof err.response.data.error === 'string' ? err.response.data.error : JSON.stringify(err.response.data.error))
      : err?.message || 'Request failed'
    return { domain, company: domain, scores: null, icpScore: null, tier: null, email: null, error: detail, status: 'Failed' }
  }
}

export default function App() {
  // The accounts load instantly from the bundled, pre-scored dataset.
  const [results, setResults] = useState(accounts)
  const [runningRows, setRunningRows] = useState(() => new Set()) // per-row re-runs in flight
  const [runningAll, setRunningAll] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [progress, setProgress] = useState('')

  const busy = runningAll || runningRows.size > 0

  // Re-score a single account — the quick "refresh just this one" (~1 min).
  async function rerunRow(domain) {
    if (runningAll || runningRows.has(domain)) return
    setRunningRows((prev) => new Set(prev).add(domain))
    const row = await enrichOne(domain)
    setResults((prev) => prev.map((r) => (r.domain === domain ? row : r)))
    setRunningRows((prev) => {
      const next = new Set(prev)
      next.delete(domain)
      return next
    })
  }

  // Re-score every account live. Slow + spends credits, so it's behind a confirm.
  async function rerunAll() {
    if (busy) return
    const mins = Math.max(1, Math.round((results.length * DELAY_BETWEEN_DOMAINS_MS) / 60000))
    const ok = window.confirm(
      `Re-run all ${results.length} accounts live?\n\nThis re-scores every account from scratch — about ${mins} minute(s) — and uses the owner's API credits. The pre-loaded results stay on screen until each one finishes.`,
    )
    if (!ok) return

    setRunningAll(true)
    setCompleted(0)
    const domains = results.map((r) => r.domain)
    for (let i = 0; i < domains.length; i++) {
      setProgress(`Re-running ${i + 1} of ${domains.length} — ${domains[i]}…`)
      const row = await enrichOne(domains[i])
      setResults((prev) => prev.map((r) => (r.domain === domains[i] ? row : r)))
      setCompleted(i + 1)
      if (i < domains.length - 1) {
        setProgress(`Pacing 60s to respect rate limits — ${i + 1} of ${domains.length} done…`)
        await sleep(DELAY_BETWEEN_DOMAINS_MS)
      }
    }
    setRunningAll(false)
    setProgress('')
  }

  // Header summary, computed from whatever is currently on screen.
  const scored = results.filter((r) => typeof r.icpScore === 'number')
  const tierA = results.filter((r) => r.tier === 'A').length
  const avg = scored.length ? Math.round(scored.reduce((s, r) => s + r.icpScore, 0) / scored.length) : 0

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Sim GTM — ICP Accounts</h1>
            <p style={styles.subtitle}>
              {results.length} accounts scored · {tierA} Tier A · avg {avg}/100
            </p>
          </div>
          <div style={styles.actions}>
            <DownloadButton results={results} />
            <RunButton onClick={rerunAll} disabled={busy} isLoading={runningAll} />
          </div>
        </header>

        {runningAll && (
          <ProgressBar progress={progress} completed={completed} total={results.length} />
        )}

        <ResultsTable results={results} onRerun={rerunRow} runningRows={runningRows} />

        <p style={styles.foot}>
          Pre-scored against Sim's ICP. Click any row for the full breakdown and draft email · use ↻ to re-score one account live.
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100%', padding: '40px 20px' },
  container: { maxWidth: 1040, margin: '0 auto' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  title: { margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.3 },
  subtitle: { margin: '6px 0 0', color: 'var(--muted)', fontSize: 14 },
  actions: { display: 'flex', alignItems: 'center', gap: 10 },
  foot: { color: 'var(--muted)', fontSize: 12.5, marginTop: 14, textAlign: 'center' },
}
