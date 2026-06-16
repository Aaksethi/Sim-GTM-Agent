import { useRef, useState } from 'react'
import Papa from 'papaparse'

// UploadZone: drag-and-drop OR click to upload a CSV (.xlsx accepted in the
// picker too, but CSV is what papaparse reads reliably). We parse the file,
// pull every cell, and keep the ones that look like domains.
export default function UploadZone({ onDomainsReady }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [count, setCount] = useState(null)
  const [fileName, setFileName] = useState('')

  // Turn "https://www.Stripe.com/pricing" into "stripe.com", or return null
  // if the cell isn't a domain (e.g. a header like "Domain", or a blank).
  function normalizeDomain(raw) {
    if (!raw) return null
    let d = String(raw).trim().toLowerCase()
    if (!d) return null
    d = d.replace(/^https?:\/\//, '').replace(/^www\./, '')
    d = d.split('/')[0].split('?')[0].replace(/\.$/, '')
    // Must look like label.tld (at least one dot, valid characters).
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null
  }

  function handleFile(file) {
    if (!file) return
    setFileName(file.name)
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (res) => {
        // res.data is an array of rows (each row an array of cells).
        const cells = []
        for (const row of res.data) {
          if (Array.isArray(row)) cells.push(...row)
          else if (row && typeof row === 'object') cells.push(...Object.values(row))
          else cells.push(row)
        }
        // Keep unique, domain-shaped cells. A header like "domain" has no dot,
        // so it's filtered out automatically.
        const seen = new Set()
        const domains = []
        for (const c of cells) {
          const d = normalizeDomain(c)
          if (d && !seen.has(d)) { seen.add(d); domains.push(d) }
        }
        setCount(domains.length)
        onDomainsReady(domains)
      },
      error: () => { setCount(0); onDomainsReady([]) },
    })
  }

  function onDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    handleFile(file)
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      style={{
        ...zone,
        borderColor: isDragging ? 'var(--accent)' : 'var(--border)',
        background: isDragging ? 'rgba(245,158,11,0.06)' : 'var(--panel)',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div style={{ fontSize: 28, marginBottom: 8 }}>⬆</div>
      <div style={{ fontWeight: 600 }}>
        Drop a CSV of domains here, or <span style={{ color: 'var(--accent)' }}>click to upload</span>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
        One column of company domains (e.g. stripe.com). .csv or .xlsx
      </div>
      {count !== null && (
        <div style={{ marginTop: 14, color: count > 0 ? '#22c55e' : '#ef4444', fontSize: 14 }}>
          {count > 0
            ? `✓ Found ${count} domain${count === 1 ? '' : 's'} in ${fileName}`
            : `No domains found in ${fileName}`}
        </div>
      )}
    </div>
  )
}

const zone = {
  border: '1.5px dashed var(--border)',
  borderRadius: 12,
  padding: '38px 20px',
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'border-color .15s, background .15s',
  userSelect: 'none',
}
