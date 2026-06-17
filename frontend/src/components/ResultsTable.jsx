import { useState } from 'react'

// The 7 ICP categories, in display order. Keys match the backend's scores object
// and the maxes match clay-icp-score.md (they sum to 100).
const CATEGORIES = [
  { key: 'industry', short: 'Industry', label: 'Industry fit', max: 20 },
  { key: 'size', short: 'Size', label: 'Company size', max: 10 },
  { key: 'compliance', short: 'Comply', label: 'Compliance', max: 20 },
  { key: 'idp_sso', short: 'SSO', label: 'IdP / SSO', max: 10 },
  { key: 'ai_footprint', short: 'AI', label: 'AI footprint', max: 15 },
  { key: 'displacement', short: 'Displace', label: 'Displacement', max: 15 },
  { key: 'compliance_hiring', short: 'Hiring', label: 'Compliance hiring', max: 10 },
]

const AMBER = '#f59e0b'
const ZINC = '#3f3f46'
const EMERALD = '#10b981'
const DANGER = '#ef4444'

// Mini-bar color: full/near-full = amber, partial = zinc, empty = transparent.
function barColor(frac) {
  if (frac >= 0.66) return AMBER
  if (frac > 0) return ZINC
  return 'transparent'
}

// Tier letter (from the backend's score — logic untouched) -> badge + glow colors.
function tierInfo(tier, score) {
  const t =
    tier ||
    (score == null ? '' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'DQ')
  if (t === 'A') return { t, glow: 'rgba(16,185,129,0.30)', bg: EMERALD, fg: '#fff' }
  if (t === 'B') return { t, glow: 'rgba(245,158,11,0.32)', bg: AMBER, fg: '#1a1a1a' }
  if (t === 'C') return { t, glow: 'rgba(239,68,68,0.26)', bg: DANGER, fg: '#fff' }
  if (t === 'DQ' || t === 'Disqualify') return { t: 'DQ', glow: 'rgba(239,68,68,0.18)', bg: '#b91c1c', fg: '#fff' }
  return { t: '', glow: 'transparent', bg: 'var(--panel-2)', fg: 'var(--muted)' }
}

function Dot({ color, text, pulse }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color, fontWeight: 600, fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, animation: pulse ? 'pulse 1s ease-in-out infinite' : 'none' }} />
      {text}
    </span>
  )
}

function StatusCell({ status, scoring }) {
  if (scoring) return <Dot color={AMBER} text="Scoring…" pulse />
  if (status === 'Done') return <Dot color={EMERALD} text="Done" />
  if (status === 'Failed') return <Dot color={DANGER} text="Failed" />
  return <Dot color="#a3a3a3" text="Queued" />
}

// One table row + its expandable detail row (breakdown + email).
function Row({ r, onRerun, scoring, anyBusy }) {
  const [open, setOpen] = useState(false)
  const hasScores = !!r.scores
  const hasEmail = !!(r.email && r.email.subject)
  const canExpand = hasScores || hasEmail || !!r.error
  const ti = tierInfo(r.tier, r.icpScore)

  function copyEmail() {
    if (!hasEmail) return
    navigator.clipboard?.writeText(`Subject: ${r.email.subject}\n\n${r.email.body}`)
  }

  return (
    <>
      <tr
        className="datarow"
        onClick={() => canExpand && setOpen((v) => !v)}
        style={{ borderBottom: open ? 'none' : '1px solid var(--border)', cursor: canExpand ? 'pointer' : 'default', transition: 'background 0.15s' }}
      >
        <td style={tdCompany}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ color: 'var(--accent)', fontSize: 11, width: 9, transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none', visibility: canExpand ? 'visible' : 'hidden' }}>▸</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.company}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.domain}</div>
            </div>
          </div>
        </td>

        {CATEGORIES.map((c) => {
          const cell = hasScores ? r.scores[c.key] : null
          const pts = cell ? cell.points : null
          const frac = pts != null && c.max ? pts / c.max : 0
          return (
            <td key={c.key} style={tdNum}>
              {pts === null ? (
                <span style={{ color: '#c4c4c2' }}>—</span>
              ) : (
                <>
                  <div className="tnum" style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {pts}
                    <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 10.5 }}>/{c.max}</span>
                  </div>
                  <div style={miniTrack}>
                    <div style={{ ...miniFill, width: `${Math.round(frac * 100)}%`, background: barColor(frac) }} />
                  </div>
                </>
              )}
            </td>
          )
        })}

        <td style={tdNum}>
          {r.icpScore == null ? (
            <span style={{ color: '#c4c4c2' }}>—</span>
          ) : (
            <span className="tnum" style={{ ...totalChip, boxShadow: `0 0 16px ${ti.glow}` }}>{r.icpScore}</span>
          )}
        </td>

        <td style={tdNum}>
          {ti.t ? <span style={{ ...tierPill, background: ti.bg, color: ti.fg }}>{ti.t}</span> : <span style={{ color: '#c4c4c2' }}>—</span>}
        </td>

        <td style={tdStatus}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusCell status={r.status} scoring={scoring} />
            <button
              title="Re-score this account live"
              onClick={(e) => { e.stopPropagation(); onRerun && onRerun(r.domain) }}
              disabled={anyBusy}
              style={{ ...rerunBtn, cursor: anyBusy ? 'default' : 'pointer', opacity: anyBusy && !scoring ? 0.4 : 1 }}
            >
              {scoring ? <span style={miniSpinner} /> : '↻'}
            </button>
          </div>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={CATEGORIES.length + 4} style={detailCell}>
            <div style={{ ...detailGrid, gridTemplateColumns: hasEmail ? '1.25fr 1fr' : '1fr' }}>
              <div>
                <div className="label" style={{ marginBottom: 10 }}>Score breakdown — {r.icpScore ?? '—'}/100</div>
                {r.error && <div style={errorBox}>Failed: {r.error}</div>}
                {hasScores &&
                  CATEGORIES.map((c) => {
                    const cell = r.scores[c.key] || { points: 0, max: c.max, why: '' }
                    const frac = c.max ? cell.points / c.max : 0
                    return (
                      <div key={c.key} style={bRow}>
                        <div style={{ width: 118, fontSize: 13 }}>{c.label}</div>
                        <div className="tnum" style={{ width: 46, fontWeight: 700, fontSize: 13 }}>
                          {cell.points}
                          <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/{c.max}</span>
                        </div>
                        <div style={bTrack}>
                          <div style={{ ...bFill, width: `${Math.round(frac * 100)}%`, background: barColor(frac) }} />
                        </div>
                        <div style={{ flex: 1, color: 'var(--muted)', fontSize: 12.5 }}>{cell.why || '—'}</div>
                      </div>
                    )
                  })}
              </div>

              {hasEmail && (
                <div style={emailCol}>
                  <div style={emailHead}>
                    <span className="label">Draft email · {r.email.angle}</span>
                    <button onClick={copyEmail} style={copyBtn}>Copy</button>
                  </div>
                  <div style={emailSubject}>Subject: {r.email.subject}</div>
                  <div style={emailBody}>{r.email.body}</div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function ResultsTable({ results, onRerun, runningRows, currentDomain }) {
  if (!results || results.length === 0) {
    return <div style={empty}>No accounts loaded.</div>
  }
  const anyBusy = !!currentDomain || (runningRows && runningRows.size > 0)

  return (
    <div style={wrap}>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Company</th>
            {CATEGORIES.map((c) => (
              <th key={c.key} style={thNum} title={`${c.label} (max ${c.max})`}>{c.short}</th>
            ))}
            <th style={thNum}>Total</th>
            <th style={thNum}>Tier</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const scoring = currentDomain === r.domain || (runningRows && runningRows.has(r.domain))
            return <Row key={`${r.domain}-${i}`} r={r} onRerun={onRerun} scoring={scoring} anyBusy={anyBusy} />
          })}
        </tbody>
      </table>
    </div>
  )
}

const wrap = { border: '1px solid var(--border)', borderRadius: 14, overflowX: 'auto', background: 'var(--panel)', boxShadow: 'var(--shadow)' }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 980 }
const thBase = {
  textAlign: 'left',
  padding: '12px 12px',
  color: 'var(--muted)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 600,
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}
const th = thBase
const thNum = { ...thBase, textAlign: 'center' }
const tdCompany = { padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const tdNum = { padding: '12px 10px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }
const tdStatus = { padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const miniTrack = { width: 46, height: 4, background: '#ededeb', borderRadius: 99, overflow: 'hidden', margin: '5px auto 0' }
const miniFill = { height: '100%', borderRadius: 99, transition: 'width 0.4s ease' }
const totalChip = { display: 'inline-block', minWidth: 36, padding: '5px 9px', borderRadius: 10, fontWeight: 800, fontSize: 16, background: 'var(--panel)', border: '1px solid var(--border)' }
const tierPill = { display: 'inline-block', padding: '3px 12px', borderRadius: 99, fontWeight: 700, fontSize: 12 }
const rerunBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', color: 'var(--accent)', fontSize: 14, lineHeight: 1, padding: 0 }
const miniSpinner = { width: 12, height: 12, border: '2px solid rgba(245,158,11,0.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }
const detailCell = { padding: '6px 18px 20px', background: 'var(--panel-2)', whiteSpace: 'normal', borderBottom: '1px solid var(--border)' }
const detailGrid = { display: 'grid', gap: 26, paddingTop: 14 }
const errorBox = { color: '#b91c1c', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 10, whiteSpace: 'pre-wrap' }
const bRow = { display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }
const bTrack = { width: 90, height: 6, background: '#e6e6e3', borderRadius: 99, overflow: 'hidden' }
const bFill = { height: '100%', borderRadius: 99 }
const emailCol = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', boxShadow: 'var(--shadow)', alignSelf: 'start' }
const emailHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }
const copyBtn = { background: 'var(--accent)', color: '#1a1a1a', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
const emailSubject = { fontWeight: 700, marginBottom: 8, fontSize: 14 }
const emailBody = { whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#404040', fontSize: 13.5 }
const empty = { marginTop: 20, padding: '48px 20px', textAlign: 'center', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 12, background: 'var(--panel)' }
