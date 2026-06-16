import Papa from 'papaparse'

// Category key -> CSV column header, in order. Mirrors the table's CATEGORIES.
const CATS = [
  ['industry', 'Industry'],
  ['size', 'Size'],
  ['compliance', 'Compliance'],
  ['idp_sso', 'IdP/SSO'],
  ['ai_footprint', 'AI Footprint'],
  ['displacement', 'Displacement'],
  ['compliance_hiring', 'Compliance Hiring'],
]

// DownloadButton: only renders once there's at least one result. Exports a CSV
// with one column per scoring category (so Excel shows the matrix, not a
// paragraph), the total + tier, a single rationale column, and the email.
export default function DownloadButton({ results }) {
  if (!results || results.length === 0) return null

  function download() {
    const rows = results.map((r) => {
      const row = { Company: r.company, Domain: r.domain }

      // One column per category = its points.
      for (const [key, label] of CATS) {
        row[label] = r.scores?.[key]?.points ?? ''
      }

      row.Total = r.icpScore ?? ''
      row.Tier = r.tier ?? ''
      row.Status = r.status

      // One consolidated "why" column so the reasoning is visible without 7
      // extra columns. For failed rows, fall back to the error message.
      row['Score Rationale'] = r.scores
        ? CATS.map(([key, label]) => `${label}: ${r.scores[key]?.why || '—'}`).join('; ')
        : r.error || ''

      row['Email Angle'] = r.email?.angle ?? ''
      row['Email Subject'] = r.email?.subject ?? ''
      row['Email Body'] = r.email?.body ?? ''
      return row
    })

    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gtm-results.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button onClick={download} style={btn}>
      ↓ Download CSV
    </button>
  )
}

const btn = {
  background: 'transparent',
  color: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 9,
  padding: '9px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}
