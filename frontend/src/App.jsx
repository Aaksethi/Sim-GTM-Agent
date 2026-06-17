import { useState, useEffect } from 'react'
import axios from 'axios'
import RunButton from './components/RunButton'
import ResultsTable from './components/ResultsTable'
import DownloadButton from './components/DownloadButton'
import accounts from './data/accounts.json'

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const BACKEND_URL = `${API_BASE}/enrich`

const DELAY_BETWEEN_DOMAINS_MS = 90000
const EST_SECONDS_PER = 120
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const STORAGE_KEY = 'sim-accounts-v1'

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
  const [results, setResults] = useState(loadInitial)
  const [running, setRunning] = useState(false)
  const [runningRows, setRunningRows] = useState(() => new Set())
  const [currentDomain, setCurrentDomain] = useState(null)
  const [completed, setCompleted] = useState(0)
  const [logoError, setLogoError] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(results))
    } catch {
      /* storage full or unavailable — non-fatal */
    }
  }, [results])

  const total = results.length
  const tierA = results.filter((r) => r.tier === 'A').length
  const tierB = results.filter((r) => r.tier === 'B').length
  const scored = results.filter((r) => typeof r.icpScore === 'number')
  const hasScored = scored.length > 0
  const busy = running || runningRows.size > 0

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
        {/* ── Header ── */}
        <header style={styles.header}>
          {/* Left: logo + brand text */}
          <div style={styles.brand}>
            <div style={styles.logoBox}>
              {logoError ? (
                <span style={styles.logoFallback}>S</span>
              ) : (
                <img
                  src="/sim-logo.png"
                  alt="Sim"
                  height={38}
                  style={{ width: 'auto', display: 'block' }}
                  onError={() => setLogoError(true)}
                />
              )}
            </div>
            <div>
              <div style={styles.brandName}>sim</div>
              <div style={styles.brandTagline}>Open-source AI workspace for teams building enterprise agents</div>
              <div style={styles.brandTrust}>Trusted by 100,000+ developers · SOC2 compliant · 1,000+ integrations</div>
              <div style={styles.amberRule} />
              <div style={styles.contextLine}>Enterprise accounts scored against Sim's ICP · Healthcare &amp; Fintech · run today</div>
            </div>
          </div>

          {/* Right: pills */}
          <div style={styles.pills}>
            <span style={styles.pill}>{total} accounts</span>
            <span style={{ ...styles.pill, ...styles.pillGreen }}>{tierA} Tier A</span>
            <span style={{ ...styles.pill, ...styles.pillAmber }}>{tierB} Tier B</span>
          </div>
        </header>

        {/* ── Controls row ── */}
        <div style={styles.controlsRow}>
          <span style={styles.controlsCount}>Showing {scored.length} of {total} accounts scored</span>
          <div style={styles.controlsRight}>
            <DownloadButton results={results} />
            {hasScored && (
              <button
                onClick={saveSnapshot}
                disabled={busy}
                style={{ ...styles.saveBtn, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
              >
                ⤓ Save snapshot
              </button>
            )}
            {hasScored && (
              <button
                onClick={resetData}
                disabled={busy}
                style={{ ...styles.resetBtn, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* ── Run status (only while pipeline runs) ── */}
        {running && (
          <div style={styles.runStatus}>
            Processing {completed} of {total}
            {currentDomain ? ` · scoring ${currentDomain}` : ''}
            {remaining > 0 ? ` · ~${estMin} min remaining` : ''}
          </div>
        )}

        {/* ── Table ── */}
        <ResultsTable
          results={results}
          onRerun={rerunRow}
          runningRows={runningRows}
          currentDomain={currentDomain}
        />

        {/* ── Footer ── */}
        <div style={styles.footer}>
          <span style={styles.footText}>
            Built by Aakash Sethi · GTM Agent OS · github.com/Aaksethi/gtm-agent-os
          </span>
          <RunButton onClick={runPipeline} disabled={busy} isLoading={running} />
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100%', padding: '36px 22px' },
  container: { maxWidth: 1200, margin: '0 auto' },
  topbarTrack: { position: 'fixed', top: 0, left: 0, right: 0, height: 2, background: 'transparent', zIndex: 50 },
  topbarFill: { height: '100%', background: 'var(--accent)', transition: 'width 0.4s ease', boxShadow: '0 0 8px rgba(245,158,11,0.6)' },

  /* Header */
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  brand: { display: 'flex', alignItems: 'flex-start', gap: 16 },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    background: '#111111',
    padding: 9,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoFallback: {
    color: '#10b981',
    fontWeight: 800,
    fontSize: 24,
    lineHeight: 1,
  },
  brandName: { fontSize: 22, fontWeight: 700, color: '#111', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 5 },
  brandTagline: { fontSize: 13, color: '#555', lineHeight: 1.4, marginBottom: 2 },
  brandTrust: { fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 },
  amberRule: { width: 32, height: 2, background: '#f59e0b', borderRadius: 99, margin: '9px 0 5px' },
  contextLine: { fontSize: 12, color: 'var(--muted)' },

  /* Header pills */
  pills: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 2 },
  pill: {
    display: 'inline-block',
    padding: '5px 12px',
    borderRadius: 99,
    background: 'var(--panel)',
    border: '0.5px solid var(--border)',
    boxShadow: 'var(--shadow)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
  },
  pillGreen: { color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.07)' },
  pillAmber: { color: '#f59e0b', borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)' },

  /* Controls row */
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  controlsCount: { fontSize: 13, color: 'var(--muted)' },
  controlsRight: { display: 'flex', alignItems: 'center', gap: 8 },

  /* Run status */
  runStatus: { fontSize: 13, color: 'var(--muted)', margin: '0 0 14px', fontWeight: 500 },

  /* Action buttons */
  saveBtn: {
    background: 'rgba(16,185,129,0.10)',
    color: '#047857',
    border: '1px solid rgba(16,185,129,0.45)',
    borderRadius: 6,
    padding: '7px 13px',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  resetBtn: {
    background: 'transparent',
    color: 'var(--muted)',
    border: '0.5px solid var(--border)',
    borderRadius: 6,
    padding: '7px 12px',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
  },

  /* Footer */
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 20,
    flexWrap: 'wrap',
  },
  footText: { color: 'var(--muted)', fontSize: 10 },
}
