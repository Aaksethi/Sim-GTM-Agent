import { useState, Fragment } from 'react'

const CATEGORIES = [
  { key: 'industry', label: 'Industry fit', max: 20 },
  { key: 'size', label: 'Company size', max: 10 },
  { key: 'compliance', label: 'Compliance', max: 20 },
  { key: 'idp_sso', label: 'IdP / SSO', max: 10 },
  { key: 'ai_footprint', label: 'AI footprint', max: 15 },
  { key: 'displacement', label: 'Displacement', max: 15 },
  { key: 'compliance_hiring', label: 'Compliance hiring', max: 10 },
]

const AMBER = '#f59e0b'
const EMERALD = '#10b981'
const DANGER = '#ef4444'
const GRAY_FILL = '#d4d4d4'

function tierInfo(tier, score) {
  const t =
    tier ||
    (score == null ? '' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'DQ')
  if (t === 'A') return { t, glow: 'rgba(16,185,129,0.30)', bg: EMERALD, fg: '#fff' }
  if (t === 'B') return { t, glow: 'rgba(245,158,11,0.32)', bg: AMBER, fg: '#1a1a1a' }
  if (t === 'C') return { t, glow: 'rgba(239,68,68,0.26)', bg: DANGER, fg: '#fff' }
  if (t === 'DQ' || t === 'Disqualify') return { t: 'DQ', glow: 'rgba(239,68,68,0.18)', bg: '#b91c1c', fg: '#fff' }
  return { t: '', glow: 'transparent', bg: '#f3f3f1', fg: '#737373' }
}

// Strongest signal = the scored dimension with the highest points/max fraction.
// We surface its plain-English rationale so the founder sees WHY without clicking.
function topSignal(r) {
  if (!r.scores) return r.status === 'Failed' ? 'Scoring failed — re-run to retry' : ''
  let best = null
  for (const c of CATEGORIES) {
    const cell = r.scores[c.key]
    if (!cell || typeof cell.points !== 'number') continue
    const frac = c.max ? cell.points / c.max : 0
    if (!best || frac > best.frac) best = { frac, why: cell.why, label: c.label }
  }
  if (!best) return ''
  return best.why || best.label
}

function Dot({ color, text, pulse, empty }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color, fontWeight: 600, fontSize: 12.5 }}>
      {empty ? (
        <span style={{ width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${color}`, background: 'transparent' }} />
      ) : (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, animation: pulse ? 'pulse 1s ease-in-out infinite' : 'none' }} />
      )}
      {text}
    </span>
  )
}

function StatusCell({ status, scoring }) {
  if (scoring) return <Dot color={AMBER} text="Scoring…" pulse />
  if (status === 'Done') return <Dot color={EMERALD} text="Done" />
  if (status === 'Failed') return <Dot color={DANGER} text="Failed" />
  return <Dot color="#a3a3a3" text="Queued" empty />
}

function Row({ r, open, onToggle, onRerun, scoring, anyBusy }) {
  const hasScores = !!r.scores
  const hasEmail = !!(r.email && r.email.subject)
  const canExpand = hasScores || hasEmail || !!r.error
  const ti = tierInfo(r.tier, r.icpScore)
  const signal = topSignal(r)

  function copyEmail(e) {
    e.stopPropagation()
    if (!hasEmail) return
    navigator.clipboard?.writeText(`Subject: ${r.email.subject}\n\n${r.email.body}`)
  }

  return (
    <Fragment>
      <div
        className="gridrow"
        style={{ ...rowGrid, cursor: canExpand ? 'pointer' : 'default' }}
        onClick={() => canExpand && onToggle(r.domain)}
      >
        {/* COMPANY */}
        <div style={cCompany}>
          <span style={{ color: 'var(--accent)', fontSize: 11, width: 9, flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none', visibility: canExpand ? 'visible' : 'hidden' }}>▸</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.company}</div>
            <div style={{ color: '#737373', fontSize: 10 }}>{r.domain}</div>
          </div>
        </div>

        {/* TOP SIGNAL */}
        <div style={cSignal}>
          <span style={signalText}>{signal || '—'}</span>
        </div>

        {/* TOTAL */}
        <div style={cTotal}>
          {r.icpScore == null ? (
            <span style={{ color: '#c4c4c2' }}>—</span>
          ) : (
            <span className="tnum" style={{ fontWeight: 800, fontSize: 16, color: '#1a1a1a' }}>{r.icpScore}</span>
          )}
        </div>

        {/* TIER */}
        <div style={cTier}>
          {ti.t ? <span style={{ ...tierPill, background: ti.bg, color: ti.fg }}>{ti.t}</span> : <span style={{ color: '#c4c4c2' }}>—</span>}
        </div>

        {/* STATUS */}
        <div style={cStatus}>
          <StatusCell status={r.status} scoring={scoring} />
        </div>

        {/* RERUN */}
        <div style={cRerun}>
          <button
            className="rerun-btn"
            title="Re-score this account"
            disabled={anyBusy}
            onClick={(e) => { e.stopPropagation(); onRerun && onRerun(r.domain) }}
          >
            {scoring ? <span style={miniSpinner} /> : '↺'}
          </button>
        </div>
      </div>

      {open && canExpand && (
        <div style={panel}>
          {/* LEFT — score breakdown */}
          <div style={breakdownCard}>
            <div style={{ ...cardHead, marginBottom: 10 }}>SCORE BREAKDOWN — {r.icpScore ?? '—'}/100</div>
            {r.error && <div style={errorBox}>{r.error}</div>}
            {hasScores &&
              CATEGORIES.map((c) => {
                const cell = r.scores[c.key] || { points: 0, max: c.max, why: '' }
                const frac = c.max ? cell.points / c.max : 0
                return (
                  <div key={c.key}>
                    <div style={bRow}>
                      <div style={bLabel}>{c.label}</div>
                      <div className="tnum" style={bScore}>
                        {cell.points}
                        <span style={{ color: '#a3a3a3', fontWeight: 400 }}>/{c.max}</span>
                      </div>
                      <div style={bTrack}>
                        <div style={{ ...bFill, width: `${Math.round(frac * 100)}%`, background: frac >= 0.6 ? AMBER : GRAY_FILL }} />
                      </div>
                    </div>
                    {cell.why ? (
                      <div style={bWhy} title={cell.why}>{cell.why}</div>
                    ) : null}
                  </div>
                )
              })}
          </div>

          {/* RIGHT — draft email (Tier A/B) or note */}
          <div style={emailCard}>
            {ti.t === 'C' || ti.t === 'DQ' ? (
              <div style={emailNote}>Below ICP threshold — no draft generated.</div>
            ) : hasEmail ? (
              <Fragment>
                <div style={emailHead}>
                  <span style={cardHead}>DRAFT EMAIL · TIER {ti.t} · {r.icpScore}</span>
                  <button onClick={copyEmail} style={copyBtn}>Copy</button>
                </div>
                <div style={emailSubject}>{r.email.subject}</div>
                <div style={emailBody}>{r.email.body}</div>
              </Fragment>
            ) : (
              <div style={emailNote}>No draft generated for this account.</div>
            )}
          </div>
        </div>
      )}
    </Fragment>
  )
}

export default function ResultsTable({ results, onRerun, runningRows, currentDomain }) {
  // Highest-scoring Tier A account is expanded by default on first load.
  const [openSet, setOpenSet] = useState(() => {
    const topA = [...(results || [])]
      .filter((r) => r.tier === 'A' || (typeof r.icpScore === 'number' && r.icpScore >= 85))
      .sort((a, b) => (b.icpScore || 0) - (a.icpScore || 0))[0]
    return new Set(topA ? [topA.domain] : [])
  })

  if (!results || results.length === 0) {
    return <div style={empty}>No accounts loaded.</div>
  }

  const anyBusy = !!currentDomain || (runningRows && runningRows.size > 0)
  function toggle(domain) {
    setOpenSet((prev) => {
      const n = new Set(prev)
      n.has(domain) ? n.delete(domain) : n.add(domain)
      return n
    })
  }

  return (
    <div style={wrap}>
      <div style={inner}>
        <div style={headerRow}>
          <div style={hCell}>Company</div>
          <div style={hCell}>Top signal</div>
          <div style={{ ...hCell, textAlign: 'center' }}>Total</div>
          <div style={{ ...hCell, textAlign: 'center' }}>Tier</div>
          <div style={hCell}>Status</div>
          <div style={hCell} />
        </div>
        {results.map((r, i) => {
          const scoring = currentDomain === r.domain || (runningRows && runningRows.has(r.domain))
          return (
            <Row
              key={`${r.domain}-${i}`}
              r={r}
              open={openSet.has(r.domain)}
              onToggle={toggle}
              onRerun={onRerun}
              scoring={scoring}
              anyBusy={anyBusy}
            />
          )
        })}
      </div>
    </div>
  )
}

const GRID = '2.2fr 2fr 70px 60px 90px 40px'

const wrap = {
  borderRadius: 12,
  border: '0.5px solid #e5e5e3',
  overflowX: 'auto',
  background: '#fff',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.05)',
}
const inner = { minWidth: 820 }
const headerRow = { display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '11px 18px', background: '#fafaf9', borderBottom: '0.5px solid #e5e5e3' }
const hCell = { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9ca3af', whiteSpace: 'nowrap' }
const rowGrid = { display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '13px 18px' }
const cCompany = { display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }
const cSignal = { minWidth: 0, overflow: 'hidden' }
const signalText = { display: 'block', fontSize: 11, color: '#737373', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }
const cTotal = { textAlign: 'center' }
const cTier = { textAlign: 'center' }
const cStatus = {}
const cRerun = { textAlign: 'center' }
const tierPill = { display: 'inline-block', padding: '4px 11px', borderRadius: 6, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em' }
const miniSpinner = { width: 12, height: 12, border: '2px solid rgba(245,158,11,0.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }

const panel = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '4px 18px 20px', background: '#fafaf9', borderBottom: '0.5px solid #e5e5e3' }
const breakdownCard = { background: '#f8f8f7', border: '0.5px solid #e5e5e3', borderRadius: 8, padding: '14px 16px' }
const emailCard = { background: '#fff', border: '0.5px solid #e5e5e3', borderRadius: 8, padding: '14px 16px', alignSelf: 'start' }
const cardHead = { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9ca3af' }
const bRow = { display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }
const bLabel = { width: 120, fontSize: 11, color: '#444', flexShrink: 0 }
const bScore = { width: 42, fontSize: 11, fontWeight: 700, color: '#1a1a1a', flexShrink: 0 }
const bTrack = { flex: 1, height: 4, background: '#e8e8e5', borderRadius: 99, overflow: 'hidden' }
const bFill = { height: '100%', borderRadius: 99, transition: 'width 0.4s ease' }
const bWhy = {
  fontSize: 11,
  color: '#737373',
  lineHeight: 1.5,
  marginTop: 4,
  marginBottom: 12,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}
const emailHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }
const copyBtn = { background: 'var(--accent)', color: '#1a1a1a', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const emailSubject = { fontWeight: 700, fontSize: 12, color: '#1a1a1a', marginBottom: 8 }
const emailBody = { whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: 1.7, color: '#444' }
const emailNote = { fontSize: 11.5, color: '#a3a3a3', fontStyle: 'italic', padding: '4px 0' }
const errorBox = { color: '#b91c1c', background: 'rgba(239,68,68,0.06)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, margin: '8px 0', whiteSpace: 'pre-wrap' }
const empty = { marginTop: 20, padding: '48px 20px', textAlign: 'center', color: '#737373', border: '1px dashed rgba(0,0,0,0.1)', borderRadius: 12, background: '#fff' }
