import { useState } from 'react'

// The 7 ICP categories, in display order. Keys match the backend's scores object
// and the maxes match clay-icp-score.md (they sum to 100).
const CATEGORIES = [
  { key: 'industry', short: 'Industry', label: 'Industry fit', max: 20 },
  { key: 'size', short: 'Size', label: 'Company size', max: 10 },
  { key: 'compliance', short: 'Comply', label: 'Compliance cert', max: 20 },
  { key: 'idp_sso', short: 'SSO', label: 'IdP / SSO', max: 10 },
  { key: 'ai_footprint', short: 'AI', label: 'AI footprint', max: 15 },
  { key: 'displacement', short: 'Displace', label: 'Displacement', max: 15 },
  { key: 'compliance_hiring', short: 'Hiring', label: 'Compliance hiring', max: 10 },
]

// Semantic colors tuned to read on a white background.
const GREEN = '#16a34a'
const AMBER = '#d97706'
const RED = '#dc2626'

// Color a category value by how full it is (points / max).
function cellColor(points, max) {
  if (!max) return 'var(--muted)'
  const frac = points / max
  if (frac >= 0.66) return GREEN
  if (frac >= 0.33) return AMBER
  if (frac > 0) return RED
  return 'var(--muted)' // 0 / unknown
}

// Total -> badge colors + tier (OS thresholds: A 85+, B 70+, C 50+, else DQ).
function tierBadge(score, tier) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return { score: '—', tier: '', fg: 'var(--muted)', bg: 'var(--panel-2)' }
  }
  if (score >= 85) return { score, tier: tier || 'A', fg: GREEN, bg: 'rgba(22,163,74,0.12)' }
  if (score >= 70) return { score, tier: tier || 'B', fg: AMBER, bg: 'rgba(217,119,6,0.12)' }
  if (score >= 50) return { score, tier: tier || 'C', fg: RED, bg: 'rgba(220,38,38,0.10)' }
  return { score, tier: tier || 'DQ', fg: RED, bg: 'rgba(220,38,38,0.08)' }
}

function statusColor(status) {
  if (status === 'Done') return GREEN
  if (status === 'Failed') return RED
  return '#9ca3af' // pending / unknown
}

// One table row + its expandable detail row (breakdown + email).
function Row({ r, onRerun, running }) {
  const [open, setOpen] = useState(false)
  const badge = tierBadge(r.icpScore, r.tier)
  const hasScores = !!r.scores
  const hasEmail = !!(r.email && r.email.subject)
  const canExpand = hasScores || hasEmail || !!r.error

  function copyEmail() {
    if (!hasEmail) return
    navigator.clipboard?.writeText(`Subject: ${r.email.subject}\n\n${r.email.body}`)
  }

  return (
    <>
      <tr
        className="datarow"
        onClick={() => canExpand && setOpen((v) => !v)}
        style={{
          borderBottom: open ? 'none' : '1px solid var(--border)',
          cursor: canExpand ? 'pointer' : 'default',
        }}
      >
        <td style={td}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {canExpand && (
              <span style={{ color: 'var(--accent)', fontSize: 11, width: 10 }}>{open ? '▾' : '▸'}</span>
            )}
            <div>
              <div style={{ fontWeight: 600 }}>{r.company}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.domain}</div>
            </div>
          </div>
        </td>

        {CATEGORIES.map((c) => {
          const cell = hasScores ? r.scores[c.key] : null
          const points = cell ? cell.points : null
          return (
            <td key={c.key} style={tdNum}>
              {points === null ? (
                <span style={{ color: 'var(--muted)' }}>—</span>
              ) : (
                <span style={{ color: cellColor(points, c.max), fontWeight: 700 }}>
                  {points}
                  <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 11 }}>/{c.max}</span>
                </span>
              )}
            </td>
          )
        })}

        <td style={tdNum}>
          <span style={{ ...pill, background: badge.bg, color: badge.fg }}>{badge.score}</span>
        </td>
        <td style={tdNum}>
          {badge.tier ? (
            <span style={{ ...tierPill, color: badge.fg, borderColor: badge.fg }}>{badge.tier}</span>
          ) : (
            '—'
          )}
        </td>
        <td style={td}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: statusColor(r.status), fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(r.status) }} />
              {r.status}
            </span>
            <button
              title="Re-score this account live"
              onClick={(e) => { e.stopPropagation(); onRerun && onRerun(r.domain) }}
              disabled={running}
              style={{ ...rerunBtn, cursor: running ? 'default' : 'pointer' }}
            >
              {running ? <span style={miniSpinner} /> : '↻'}
            </button>
          </div>
        </td>
      </tr>

      {open && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td colSpan={CATEGORIES.length + 4} style={detailCell}>
            {r.error && <div style={errorBox}>Failed: {r.error}</div>}

            {hasScores && (
              <div style={{ marginBottom: hasEmail ? 16 : 0 }}>
                <div style={detailTitle}>Score breakdown — total {r.icpScore}/100</div>
                {CATEGORIES.map((c) => {
                  const cell = r.scores[c.key] || { points: 0, max: c.max, why: '' }
                  const frac = c.max ? cell.points / c.max : 0
                  return (
                    <div key={c.key} style={breakdownRow}>
                      <div style={{ width: 150, color: 'var(--text)' }}>{c.label}</div>
                      <div style={{ width: 56, color: cellColor(cell.points, c.max), fontWeight: 700 }}>
                        {cell.points}
                        <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/{c.max}</span>
                      </div>
                      <div style={barTrack}>
                        <div style={{ ...barFill, width: `${Math.round(frac * 100)}%`, background: cellColor(cell.points, c.max) }} />
                      </div>
                      <div style={{ flex: 1, color: 'var(--muted)', fontSize: 13 }}>{cell.why || '—'}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {hasEmail && (
              <div>
                <div style={emailHeader}>
                  <span style={anglePill}>Angle: {r.email.angle || '—'}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>Draft — review before sending</span>
                  <button onClick={copyEmail} style={copyBtn}>Copy</button>
                </div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Subject: {r.email.subject}</div>
                <div style={emailBody}>{r.email.body}</div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// The table. Empty state when there are no accounts at all.
export default function ResultsTable({ results, onRerun, runningRows }) {
  if (!results || results.length === 0) {
    return <div style={empty}>No accounts loaded yet.</div>
  }

  return (
    <div style={wrap}>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Company</th>
            {CATEGORIES.map((c) => (
              <th key={c.key} style={thNum} title={`${c.label} (max ${c.max})`}>
                {c.short}
                <span style={{ display: 'block', fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>/{c.max}</span>
              </th>
            ))}
            <th style={thNum}>Total</th>
            <th style={thNum}>Tier</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <Row key={`${r.domain}-${i}`} r={r} onRerun={onRerun} running={runningRows?.has(r.domain)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const wrap = {
  marginTop: 4,
  border: '1px solid var(--border)',
  borderRadius: 12,
  overflowX: 'auto', // ~11 columns — scroll sideways on narrow screens
  background: 'var(--panel)',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
}
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 900 }
const th = {
  textAlign: 'left',
  padding: '11px 14px',
  color: 'var(--muted)',
  fontSize: 11.5,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  borderBottom: '1px solid var(--border)',
  background: 'var(--panel-2)',
  whiteSpace: 'nowrap',
}
const thNum = { ...th, textAlign: 'center' }
const td = { padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap', color: 'var(--text)' }
const tdNum = { ...td, textAlign: 'center' }
const pill = { display: 'inline-block', padding: '4px 10px', borderRadius: 99, fontWeight: 700, fontSize: 13 }
const tierPill = {
  display: 'inline-block',
  padding: '2px 9px',
  borderRadius: 99,
  border: '1px solid',
  fontWeight: 700,
  fontSize: 12,
}
const empty = {
  marginTop: 20,
  padding: '48px 20px',
  textAlign: 'center',
  color: 'var(--muted)',
  border: '1px dashed var(--border)',
  borderRadius: 12,
  background: 'var(--panel)',
}
const rerunBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: '#fff',
  color: 'var(--accent)',
  fontSize: 14,
  lineHeight: 1,
  padding: 0,
}
const miniSpinner = {
  width: 12,
  height: 12,
  border: '2px solid rgba(79,70,229,0.3)',
  borderTopColor: 'var(--accent)',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
  display: 'inline-block',
}
const detailCell = { padding: '14px 16px 18px', background: 'var(--panel-2)', whiteSpace: 'normal' }
const detailTitle = {
  color: 'var(--muted)',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 10,
}
const errorBox = {
  color: '#b91c1c',
  background: 'rgba(220,38,38,0.08)',
  border: '1px solid rgba(220,38,38,0.30)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  marginBottom: 12,
  whiteSpace: 'pre-wrap',
}
const breakdownRow = { display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }
const barTrack = { width: 120, height: 7, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }
const barFill = { height: '100%', borderRadius: 99 }
const emailHeader = { display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0 10px' }
const anglePill = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 99,
  background: 'rgba(79,70,229,0.10)',
  color: 'var(--accent)',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'capitalize',
}
const copyBtn = {
  marginLeft: 'auto',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 7,
  padding: '5px 13px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}
const emailBody = {
  whiteSpace: 'pre-wrap',
  lineHeight: 1.6,
  color: 'var(--text)',
  fontSize: 14,
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '13px 15px',
}
