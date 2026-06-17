import { useState } from 'react'
import axios from 'axios'
import RunButton from './components/RunButton'
import ResultsTable from './components/ResultsTable'
import DownloadButton from './components/DownloadButton'
import accounts from './data/accounts.json'

// Backend endpoint. In production (Netlify) VITE_BACKEND_URL points at the
// deployed Render backend; locally it falls back to localhost.
const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const BACKEND_URL = `${API_BASE}/enrich`

// Pacing between domains on a run, to stay under the Anthropic
// input-tokens-per-minute limit on a Tier 1 account.
const DELAY_BETWEEN_DOMAINS_MS = 45000
const EST_SECONDS_PER = 75 // rough wall-clock per domain (enrich + pacing) for the ETA
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Enrich one domain via the backend and return a normalized row. Never throws.
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
  // The 36 accounts load instantly from the bundled list (status "pending").
  const [results, setResults] = useState(accounts)
  const [running, setRunning] = useState(false)          // full pipeline run
  const [runningRows, setRunningRows] = useState(() => new Set()) // per-row re-runs
  const [currentDomain, setCurrentDomain] = useState(null)       // row being scored now
  const [completed, setCompleted] = useState(0)

  const total = results.length
  const tierA = results.filter((r) => r.tier === 'A').length
  const scored = results.filter((r) => typeof r.icpScore === 'number')
  const avg = scored.length ? Math.round(scored.reduce((s, r) => s + r.icpScore, 0) / scored.length) : 0
  const busy = running || runningRows.size > 0

  // Re-score a single account (the quick "refresh just this one").
  async function rerunRow(domain) {
    if (running || runningRows.has(domain)) return
    setRunningRows((p) => new Set(p).add(domain))
    const row = await enrichOne(domain)
    setResults((p) => p.map((r) => (r.domain === domain ? row : r)))
    setRunningRows((p) => {
      const n = new Set(p)
      n.delete(domain)
      return n
    })
  }

  // Run the whole pipeline: score every account live, in order, filling the table.
  async function runPipeline() {
    if (busy) return
    setRunning(true)
    setCompleted(0)
    const domains = results.map((r) => r.domain)
    for (let i = 0; i < domains.length; i++) {
      setCurrentDomain(domains[i])
      const row = await enrichOne(domains[i])
      setResults((p) => p.map((r) => (r.domain === domains[i] ? row : r)))
      setCompleted(i + 1)
      if (i < domains.length - 1) await sleep(DELAY_BETWEEN_DOMAINS_MS)
    }
    setCurrentDomain(null)
    setRunning(false)
  }

  const pct = total ? Math.round((completed / total) * 100) : 0
  const remaining = total - completed
  const estMin = Math.max(1, Math.ceil((remaining * EST_SECONDS_PER) / 60))

  return (
    <div style={styles.page}>
      {running && (
        <div style={styles.topbarTrack}>
          <div style={{ ...styles.topbarFill, width: `${pct}%` }} />
        </div>
      )}

      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.logo}>S</div>
            <div>
              <div style={styles.brandName}>Sim</div>
              <div style={styles.brandSub}>GTM Intelligence · Enterprise Compliance</div>
            </div>
          </div>
          <div style={styles.actions}>
            <span style={styles.pill}>{total} accounts</span>
            <span style={{ ...styles.pill, ...styles.pillGreen }}>{tierA} Tier A</span>
            <DownloadButton results={results} />
            <RunButton onClick={runPipeline} disabled={busy} isLoading={running} />
          </div>
        </header>

        {running && (
          <div style={styles.runStatus}>
            Processing {completed} of {total}
            {currentDomain ? ` · scoring ${currentDomain}` : ''}
            {remaining > 0 ? ` · ~${estMin} min remaining` : ''}
          </div>
        )}

        <ResultsTable
          results={results}
          onRerun={rerunRow}
          runningRows={runningRows}
          currentDomain={currentDomain}
        />

        <p style={styles.foot}>
          {avg ? `Average ${avg}/100 across scored accounts · ` : ''}
          Click any row for the full breakdown and draft email · ↻ re-scores one account live.
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100%', padding: '36px 22px' },
  container: { maxWidth: 1120, margin: '0 auto' },
  topbarTrack: { position: 'fixed', top: 0, left: 0, right: 0, height: 2, background: 'transparent', zIndex: 50 },
  topbarFill: { height: '100%', background: 'var(--accent)', transition: 'width 0.4s ease', boxShadow: '0 0 8px rgba(245,158,11,0.6)' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 22,
    flexWrap: 'wrap',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 9,
    background: 'var(--accent)',
    color: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 19,
    boxShadow: '0 1px 3px rgba(245,158,11,0.4)',
  },
  brandName: { fontSize: 20, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.1 },
  brandSub: { fontSize: 12, color: 'var(--muted)', marginTop: 2 },
  actions: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  pill: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: 99,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
  },
  pillGreen: { color: 'var(--emerald)', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.07)' },
  runStatus: { fontSize: 13, color: 'var(--muted)', margin: '0 0 14px', fontWeight: 500 },
  foot: { color: 'var(--muted)', fontSize: 12.5, marginTop: 16, textAlign: 'center' },
}
