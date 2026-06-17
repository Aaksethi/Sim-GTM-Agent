import { useState } from 'react'

const CATEGORIES = [
  { key: 'industry', short: 'IND', label: 'Industry fit', max: 20 },
  { key: 'size', short: 'SIZE', label: 'Company size', max: 10 },
  { key: 'compliance', short: 'COMPLY', label: 'Compliance', max: 20 },
  { key: 'idp_sso', short: 'SSO', label: 'IdP / SSO', max: 10 },
  { key: 'ai_footprint', short: 'AI', label: 'AI footprint', max: 15 },
  { key: 'displacement', short: 'DISPLACE', label: 'Displacement', max: 15 },
  { key: 'compliance_hiring', short: 'HIRE', label: 'Compliance hiring', max: 10 },
]

const AMBER = '#f59e0b'
const ZINC = '#3f3f46'
const EMERALD = '#10b981'
const DANGER = '#ef4444'

function barColor(frac) {
  if (frac >= 0.66) return AMBER
  if (frac > 0) return ZINC
  return 'transparent'
}

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

function Dot({ color, text, pulse, empty }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color, fontWeight: 600, fontSize: 13 }}>
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
        style={{ borderBottom: open ? 'none' : undefined, cursor: canExpand ? 'pointer' : 'default' }}
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
          <StatusCell status={r.status} scoring={scoring} />
        </td>

        <td style={tdRerun}>
          <button
            className="rerun-btn"
            title="Re-score this account"
            onClick={(e) => { e.stopPropagation(); onRerun && onRerun(r.domain) }}
            disabled={anyBusy}
          >
            {scoring ? <span style={miniSpinner} /> : '↺'}
          </button>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={CATEGORIES.length + 5} style={detailCell}>
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
                    <span className="label">DRAFT EMAIL · {r.company.toUpperCase()} · TIER {ti.t} · {r.icpScore}/100</span>
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
            <th style={thNum}></th>
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

const wrap = {
  borderRadius: 12,
  overflowX: 'auto',
  background: 'var(--panel)',
  boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.05)',
}
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 980 }
const thBase = {
  textAlign: 'left',
  padding: '11px 14px',
  color: '#9ca3af',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 700,
  background: '#fafaf9',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
  whiteSpace: 'nowrap',
}
const th = thBase
const thNum = { ...thBase, textAlign: 'center' }
const tdCompany = { padding: '14px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const tdNum = { padding: '13px 10px', verticalAlign: 'middle', textAlign: 'center', whiteSpace: 'nowrap' }
const tdStatus = { padding: '14px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const tdRerun = { padding: '14px 10px', verticalAlign: 'middle', textAlign: 'center', width: 44 }
const miniTrack = { width: 44, height: 3, background: '#e8e8e5', borderRadius: 99, overflow: 'hidden', margin: '6px auto 0' }
const miniFill = { height: '100%', borderRadius: 99, transition: 'width 0.4s ease' }
const totalChip = {
  display: 'inline-block',
  minWidth: 42,
  padding: '5px 10px',
  borderRadius: 8,
  fontWeight: 800,
  fontSize: 17,
  letterSpacing: '-0.02em',
  background: '#f5f4f2',
  border: '1px solid rgba(0,0,0,0.08)',
  color: '#1a1a1a',
}
const tierPill = {
  display: 'inline-block',
  padding: '4px 11px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: '0.04em',
}
const miniSpinner = { width: 12, height: 12, border: '2px solid rgba(245,158,11,0.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }
const detailCell = { padding: '8px 20px 24px', background: '#fafaf9', whiteSpace: 'normal', borderBottom: '1px solid rgba(0,0,0,0.06)' }
const detailGrid = { display: 'grid', gap: 28, paddingTop: 16 }
const errorBox = { color: '#b91c1c', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12, whiteSpace: 'pre-wrap' }
const bRow = { display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0' }
const bTrack = { width: 96, height: 5, background: '#e8e8e5', borderRadius: 99, overflow: 'hidden' }
const bFill = { height: '100%', borderRadius: 99 }
const emailCol = {
  background: '#ffffff',
  border: '1px solid rgba(0,0,0,0.07)',
  borderRadius: 10,
  padding: '18px 20px',
  alignSelf: 'start',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
}
const emailHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }
const copyBtn = {
  background: 'var(--accent)',
  color: '#1a1a1a',
  border: 'none',
  borderRadius: 6,
  padding: '5px 13px',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: '0.02em',
}
const emailSubject = { fontWeight: 700, marginBottom: 10, fontSize: 14, color: '#1a1a1a', letterSpacing: '-0.01em' }
const emailBody = { whiteSpace: 'pre-wrap', lineHeight: 1.75, color: '#444', fontSize: 13.5 }
const empty = { marginTop: 20, padding: '48px 20px', textAlign: 'center', color: 'var(--muted)', border: '1px dashed rgba(0,0,0,0.1)', borderRadius: 12, background: 'var(--panel)' }
