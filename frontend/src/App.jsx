import { useState } from 'react'
import axios from 'axios'
import UploadZone from './components/UploadZone'
import RunButton from './components/RunButton'
import ProgressBar from './components/ProgressBar'
import ResultsTable from './components/ResultsTable'
import DownloadButton from './components/DownloadButton'

// Where the backend lives. Each domain is POSTed here one at a time.
// In production (Netlify) set VITE_BACKEND_URL to the deployed backend URL
// (e.g. https://your-backend.onrender.com). Locally it falls back to localhost.
const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const BACKEND_URL = `${API_BASE}/enrich`

// Pause between domains so we don't fire two token-heavy MCP calls in the same
// minute and trip the Anthropic input-tokens-per-minute rate limit.
// - On a low (Tier 1) account, set this to ~60000 (60s) for zero 429s.
// - After raising your usage tier, drop it to 0–2000 for a faster demo.
// The backend also retries automatically on 429, so this is the smoother,
// not the only, line of defense.
const DELAY_BETWEEN_DOMAINS_MS = 60000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default function App() {
  // ----- All app state lives here -----
  const [domains, setDomains] = useState([])     // domains parsed from the CSV
  const [results, setResults] = useState([])     // enriched rows, filled one by one
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState('')   // e.g. "Processing 3 of 10 domains..."
  const [error, setError] = useState(null)

  // Called by UploadZone once it has parsed the file.
  function handleDomainsReady(list) {
    setDomains(list)
    setResults([])
    setProgress('')
    setError(null)
  }

  // The pipeline: walk the domains SEQUENTIALLY so the table fills row by row.
  async function runPipeline() {
    if (domains.length === 0 || isLoading) return
    setIsLoading(true)
    setResults([])
    setError(null)

    const total = domains.length

    for (let i = 0; i < total; i++) {
      const domain = domains[i]
      setProgress(`Processing ${i + 1} of ${total} domains...`)

      let row
      try {
        const { data } = await axios.post(BACKEND_URL, { domain })

        // Happy path: backend returned { company, icpScore, signal }.
        if (data && (data.company !== undefined || data.icpScore !== undefined)) {
          row = {
            domain,
            company: data.company ?? domain,
            // Per-category breakdown { points, max, why } for the 7 categories.
            scores: data.scores ?? null,
            icpScore: typeof data.icpScore === 'number' ? data.icpScore : null,
            tier: data.tier ?? null,
            // Present only for good-fit accounts (score >= 70); null otherwise.
            email: data.email && data.email.subject ? data.email : null,
            error: null,
            status: 'Done',
          }
        } else {
          // Backend responded but without clean JSON (e.g. { raw } or { error }).
          const detail = data?.raw
            ? String(data.raw)
            : data?.error
              ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error))
              : 'No usable data returned'
          row = { domain, company: domain, scores: null, icpScore: null, tier: null, email: null, error: detail, status: 'Failed' }
        }
      } catch (err) {
        // Network error, 4xx/5xx, etc. Mark this one Failed and keep going.
        const detail = err?.response?.data?.error
          ? (typeof err.response.data.error === 'string' ? err.response.data.error : JSON.stringify(err.response.data.error))
          : err?.message || 'Request failed'
        row = { domain, company: domain, scores: null, icpScore: null, tier: null, email: null, error: detail, status: 'Failed' }
      }

      // Append this row — React paints it before the next request starts.
      setResults((prev) => [...prev, row])

      // Pace the next request (skip the wait after the final domain).
      if (i < total - 1 && DELAY_BETWEEN_DOMAINS_MS > 0) {
        setProgress(
          `Pacing ${DELAY_BETWEEN_DOMAINS_MS / 1000}s to respect rate limits — ${i + 1} of ${total} done...`,
        )
        await sleep(DELAY_BETWEEN_DOMAINS_MS)
      }
    }

    setIsLoading(false)
    setProgress('')
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>
              <span style={{ color: 'var(--accent)' }}>◆</span> Sim GTM — Command Center
            </h1>
            <p style={styles.subtitle}>
              Upload domains. Enrich via Clay. Score against the ICP. Ship outreach-ready accounts.
            </p>
          </div>
          <DownloadButton results={results} />
        </header>

        <UploadZone onDomainsReady={handleDomainsReady} />

        <div style={styles.controls}>
          <RunButton
            onClick={runPipeline}
            disabled={domains.length === 0 || isLoading}
            isLoading={isLoading}
          />
          {domains.length > 0 && !isLoading && (
            <span style={styles.muted}>
              {domains.length} domain{domains.length === 1 ? '' : 's'} loaded
            </span>
          )}
        </div>

        {isLoading && (
          <ProgressBar progress={progress} completed={results.length} total={domains.length} />
        )}

        {error && <div style={styles.error}>{error}</div>}

        <ResultsTable results={results} />
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100%', padding: '40px 20px' },
  container: { maxWidth: 980, margin: '0 auto' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 22,
  },
  title: { margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.2 },
  subtitle: { margin: '6px 0 0', color: 'var(--muted)', fontSize: 14 },
  controls: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 },
  muted: { color: 'var(--muted)', fontSize: 14 },
  error: {
    marginTop: 16,
    padding: '12px 14px',
    borderRadius: 9,
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.4)',
    color: '#fca5a5',
    fontSize: 14,
  },
}
