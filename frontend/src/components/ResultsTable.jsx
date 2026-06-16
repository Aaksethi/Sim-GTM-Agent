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

// Color a category value by how full it is (points / max).
function cellColor(points, max) {
  if (!max) return 'var(--muted)'
  const frac = points / max
  if (frac >= 0.66) return '#22c55e' // green
  if (frac >= 0.33) return '#f59e0b' // amber
  if (frac > 0) return '#ef4444' // red
  return 'var(--muted)' // 0 / unknown
}

// Total -> badge colors + tier (OS thresholds: A 85+, B 70+, C 50+, else DQ).
function tierBadge(score, tier) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return { score: '—', tier: '', fg: '#999', bg: '#2a2a2a' }
  }
  if (score >= 85) return { score, tier: tier || 'A', fg: '#22c55e', bg: 'rgba(34,197,94,0.14)' }
  if (score >= 70) return { score, tier: tier || 'B', fg: '#f59e0b', bg: 'rgba(245,158,11,0.14)' }
  if (score >= 50) return { score, tier: tier || 'C', fg: '#ef4444', bg: 'rgba(239,68,68,0.14)' }
  return { score, tier: tier || 'DQ', fg: '#ef4444', bg: 'rgba(239,68,68,0.10)' }
}

// One table row + its expandable detail row (breakdown + email).
function Row({ r }) {
  const [open, setOpen] = useState(false)
  const badge = tierBadge(r.icpScore, r.tier)
  const statusColor = r.status === 'Done' ? '#22c55e' : '#ef4444'
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
        onClick={() => canExpand && setOpen((v) => !v)}
        style={{
          animation: 'fadeInRow 0.25s ease',
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: statusColor, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
            {r.status}
          </span>
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

// The table. Empty state when nothing has been run yet.
export default function ResultsTable({ results }) {
  if (!results || results.length === 0) {
    return <div style={empty}>Upload a CSV to get started</div>
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
                <span style={{ display: 'block', fontSize: 10, color: '#666', fontWeight: 400 }}>/{c.max}</span>
              </th>
            ))}
            <th style={thNum}>Total</th>
            <th style={thNum}>Tier</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <Row key={`${r.domain}-${i}`} r={r} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const wrap = {
  marginTop: 20,
  border: '1px solid var(--border)',
  borderRadius: 12,
  overflowX: 'auto', // ~11 columns now — scroll sideways on narrow screens
  background: 'var(--panel)',
}
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 880 }
const th = {
  textAlign: 'left',
  padding: '11px 14px',
  color: 'var(--muted)',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  borderBottom: '1px solid var(--border)',
  background: 'var(--panel-2)',
  whiteSpace: 'nowrap',
}
const thNum = { ...th, textAlign: 'center' }
const td = { padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }
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
const detailCell = { padding: '14px 16px 18px', background: 'var(--panel-2)', whiteSpace: 'normal' }
const detailTitle = {
  color: 'var(--muted)',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 10,
}
const errorBox = {
  color: '#fca5a5',
  background: 'rgba(239,68,68,0.10)',
  border: '1px solid rgba(239,68,68,0.35)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  marginBottom: 12,
  whiteSpace: 'pre-wrap',
}
const breakdownRow = { display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }
const barTrack = { width: 120, height: 7, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }
const barFill = { height: '100%', borderRadius: 99 }
const emailHeader = { display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0 10px' }
const anglePill = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 99,
  background: 'rgba(245,158,11,0.14)',
  color: 'var(--accent)',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'capitalize',
}
const copyBtn = {
  marginLeft: 'auto',
  background: 'var(--accent)',
  color: '#0f0f0f',
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
