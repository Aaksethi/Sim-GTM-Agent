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

// Builds the insight-strip sentence dynamically. Tier A and Tier B are both
// reachable today, so the count combines them; the named accounts are still the
// two highest-scoring overall.
function buildInsight(rows) {
  const reachable = rows
    .filter((r) => r.tier === 'A' || r.tier === 'B')
    .sort((a, b) => (b.icpScore || 0) - (a.icpScore || 0))
  if (reachable.length === 0) {
    return {
      bold: 'No accounts ready yet.',
      muted: ' Keep scoring — the strongest enterprise-compliance fits for Sim surface here with ready-to-send drafts.',
    }
  }
  const names = reachable.slice(0, 2).map((r) => `${r.company} (${r.icpScore})`).join(' and ')
  const s = reachable.length > 1 ? 's' : ''
  return {
    bold: `${reachable.length} account${s} ready to contact today. ${names}`,
    muted: " match Sim's enterprise compliance ICP most closely — personalized drafts are ready below.",
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

  // Display-only: sort by ICP score descending (unscored sink to the bottom).
  // State order is untouched — the pipeline still iterates `results` as-is.
  const sortedResults = [...results].sort((a, b) => {
    const sa = typeof a.icpScore === 'number' ? a.icpScore : -1
    const sb = typeof b.icpScore === 'number' ? b.icpScore : -1
    return sb - sa
  })
  const insight = buildInsight(results)

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
          {/* Left: logo · divider · two-line brand text */}
          <div style={styles.brand}>
            {logoError ? (
              <span style={styles.logoFallback}>sim</span>
            ) : (
              <img
                src="/sim-logo.png"
                alt="Sim"
                height={26}
                style={{ width: 'auto', display: 'block', flexShrink: 0 }}
                onError={() => setLogoError(true)}
              />
            )}
            <div style={styles.brandDivider} />
            <div style={styles.brandText}>
              <div style={styles.brandTagline}>Open-source AI workspace for teams building enterprise agents</div>
              <div style={styles.brandTrust}>Trusted by 100,000+ developers · SOC2 compliant · 1,000+ integrations</div>
            </div>
          </div>

          {/* Right: pills */}
          <div style={styles.pills}>
            <span style={{ ...styles.pill, ...styles.pillGray }}>{total} accounts</span>
            <span style={{ ...styles.pill, ...styles.pillGreen }}>{tierA} Tier A</span>
            <span style={{ ...styles.pill, ...styles.pillAmber }}>{tierB} Tier B</span>
          </div>
        </header>

        {/* ── Insight strip ── */}
        <div style={styles.insight}>
          <div style={styles.insightIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div style={styles.insightText}>
            <strong style={styles.insightStrong}>{insight.bold}</strong>
            <span style={styles.insightMuted}>{insight.muted}</span>
          </div>
        </div>

        {/* ── Controls row ── */}
        <div style={styles.controlsRow}>
          <span style={styles.controlsCount}>Showing {scored.length} of {total} accounts · sorted by ICP score</span>
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
            <button
              onClick={runPipeline}
              disabled={busy}
              style={{ ...styles.rerunAllBtn, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
            >
              ↻ Re-run all
            </button>
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
          results={sortedResults}
          onRerun={rerunRow}
          runningRows={runningRows}
          currentDomain={currentDomain}
        />

        {/* ── Powered by ── */}
        <div style={styles.poweredBy}>
          <span style={styles.poweredLabel}>POWERED BY</span>
          <div style={styles.toolRow}>
            {['Claude Code', 'Clay', 'Apollo', 'Firecrawl'].map((tool) => (
              <span key={tool} style={styles.toolChip}>{tool}</span>
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={styles.footer}>
          <div style={styles.footLeft}>
            <span style={styles.footText}>
              Built by Aakash Sethi · GTM Agent OS · github.com/Aaksethi/gtm-agent-os
            </span>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  brand: { display: 'flex', alignItems: 'center' },
  logoFallback: { color: '#1a1a1a', fontWeight: 700, fontSize: 20, lineHeight: 1 },
  brandDivider: { width: 1, height: 32, background: '#e5e5e3', flexShrink: 0, marginLeft: 16 },
  brandText: { display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 16 },
  brandTagline: { fontSize: 15, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.3 },
  brandTrust: { fontSize: 12, color: '#737373', marginTop: 3, lineHeight: 1.3 },

  /* Header pills */
  pills: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: {
    display: 'inline-block',
    padding: '5px 14px',
    borderRadius: 99,
    border: '0.5px solid #e5e5e3',
    fontSize: 12,
    fontWeight: 600,
  },
  pillGray: { background: '#f8f8f7', color: '#737373', borderColor: '#e5e5e3' },
  pillGreen: { background: '#ecfdf5', color: '#10b981', borderColor: 'rgba(16,185,129,0.25)' },
  pillAmber: { background: '#fffbeb', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' },

  /* Insight strip */
  insight: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '13px 16px',
    border: '0.5px solid #fde68a',
    borderRadius: 10,
    background: 'linear-gradient(90deg, #fffbeb 0%, #f8f8f7 100%)',
    marginBottom: 16,
  },
  insightIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: '#f59e0b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 1px 3px rgba(245,158,11,0.4)',
  },
  insightText: { fontSize: 13, lineHeight: 1.5 },
  insightStrong: { color: '#1a1a1a', fontWeight: 700 },
  insightMuted: { color: '#737373', fontWeight: 400 },

  /* Controls row */
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  controlsCount: { fontSize: 12, color: 'var(--muted)' },
  controlsRight: { display: 'flex', alignItems: 'center', gap: 8 },

  /* Run status */
  runStatus: { fontSize: 13, color: 'var(--muted)', margin: '0 0 14px', fontWeight: 500 },

  /* Action buttons */
  saveBtn: {
    background: 'rgba(16,185,129,0.10)',
    color: '#047857',
    border: '1px solid rgba(16,185,129,0.45)',
    borderRadius: 9,
    padding: '8px 14px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  rerunAllBtn: {
    background: '#fff',
    color: '#737373',
    border: '1px solid #e5e5e3',
    borderRadius: 9,
    padding: '8px 15px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  resetBtn: {
    background: 'transparent',
    color: 'var(--muted)',
    border: '0.5px solid var(--border)',
    borderRadius: 6,
    padding: '6px 11px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
  },

  /* Powered by */
  poweredBy: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 24, flexWrap: 'wrap' },
  poweredLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a3a3a3' },
  toolRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  toolChip: { fontSize: 12, color: '#737373', background: '#ffffff', border: '0.5px solid #e5e5e3', borderRadius: 6, padding: '5px 12px' },

  /* Footer */
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  footLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  footText: { color: 'var(--muted)', fontSize: 10 },
}
