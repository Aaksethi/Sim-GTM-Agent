import { useState, useEffect } from 'react'
import axios from 'axios'
import RunButton from './components/RunButton'
import ResultsTable from './components/ResultsTable'
import DownloadButton from './components/DownloadButton'
import accounts from './data/accounts.json'

// Backend endpoint. In production (Netlify) VITE_BACKEND_URL points at the
// deployed Render backend; locally it falls back to localhost.
const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const BACKEND_URL = `${API_BASE}/enrich`

// Pacing between domains on a full run. 90s keeps a sequential run under the
// Anthropic Tier-1 input-tokens-per-minute limit (one ~25k-token call/min).
const DELAY_BETWEEN_DOMAINS_MS = 90000
const EST_SECONDS_PER = 120 // rough wall-clock per domain (enrich + pacing) for the ETA
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// localStorage key for persisted progress. Bump the suffix if the row shape changes.
const STORAGE_KEY = 'sim-accounts-v1'

// Starting rows: merge any locally-saved scored rows over the bundled pending
// list, so a refresh never wipes completed work. Iterating the canonical
// `accounts` list keeps things correct if domains are later added or removed.
function loadInitial() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!Array.isArray(saved)) return accounts
    const byDomain = new Map(saved.map((r) => [r.domain, r]))
    return accounts.map((base) => {
      const s = byDomain.get(base.domain)
      return s && s.status === 'Done' ? s : base
    })
  } catch {
    return accounts
  }
}

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
  // Start from saved progress (localStorage) merged over the bundled list, so a
  // refresh never wipes completed scores. Falls back to the pending list.
  const [results, setResults] = useState(loadInitial)
  const [running, setRunning] = useState(false)          // full pipeline run
  const [runningRows, setRunningRows] = useState(() => new Set()) // per-row re-runs
  const [currentDomain, setCurrentDomain] = useState(null)       // row being scored now
  const [completed, setCompleted] = useState(0)

  // Persist every change so 1:1 scoring (and partial runs) survive a refresh.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(results))
    } catch {
      /* storage full or unavailable — non-fatal */
    }
  }, [results])

  const total = results.length
  const tierA = results.filter((r) => r.tier === 'A').length
  const scored = results.filter((r) => typeof r.icpScore === 'number')
  const avg = scored.length ? Math.round(scored.reduce((s, r) => s + r.icpScore, 0) / scored.length) : 0
  const hasScored = scored.length > 0
  const busy = running || runningRows.size > 0

  // Re-score a single account (the quick "refresh just this one"). This is the
  // primary 1:1 manual flow — each result is persisted by the effect above.
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

  // Export the current rows as accounts.json — drop this into src/data/ and commit
  // to freeze the scored set for the founder (localStorage is per-browser only).
  function saveSnapshot() {
    const json = JSON.stringify(results, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'accounts.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Wipe saved progress and reload the bundled pending list (in case data goes stale).
  function resetData() {
    if (busy) return
    if (!window.confirm('Clear all saved scores and reset every row to pending? This cannot be undone.')) return
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setResults(accounts)
    setCompleted(0)
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
            <span style={{ ...styles.pill, ...styles.pillNeutral }}>{scored.length} scored</span>
            <span style={{ ...styles.pill, ...styles.pillGreen }}>{tierA} Tier A</span>
            <DownloadButton results={results} />
            {hasScored && (
              <button onClick={saveSnapshot} disabled={busy} style={{ ...styles.saveBtn, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
                ⤓ Save snapshot
              </button>
            )}
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

        <div style={styles.footRow}>
          <p style={styles.foot}>
            {avg ? `Average ${avg}/100 across ${scored.length} scored · ` : ''}
            Click ↻ to score one account at a time — wait ~60s between rows to stay under the rate limit. Progress saves automatically.
          </p>
          {hasScored && (
            <button onClick={resetData} disabled={busy} style={{ ...styles.resetBtn, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
              Reset all
            </button>
          )}
        </div>
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
  pillNeutral: { color: 'var(--muted)' },
  pillGreen: { color: 'var(--emerald)', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.07)' },
  saveBtn: {
    background: 'rgba(16,185,129,0.10)',
    color: '#047857',
    border: '1px solid rgba(16,185,129,0.45)',
    borderRadius: 9,
    padding: '8px 15px',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  runStatus: { fontSize: 13, color: 'var(--muted)', margin: '0 0 14px', fontWeight: 500 },
  footRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 16, flexWrap: 'wrap' },
  foot: { color: 'var(--muted)', fontSize: 12.5, margin: 0, flex: 1, minWidth: 240 },
  resetBtn: {
    background: 'transparent',
    color: 'var(--muted)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
}
