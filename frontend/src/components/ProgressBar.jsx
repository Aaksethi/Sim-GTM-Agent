// ProgressBar: text + a bar that fills as results come in. The parent only
// renders this while isLoading is true.
export default function ProgressBar({ progress, completed, total }) {
  const pct = total ? Math.round((completed / total) * 100) : 0
  return (
    <div style={{ margin: '18px 0 6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
        <span>{progress || `Processing ${completed} of ${total} domains...`}</span>
        <span>{pct}%</span>
      </div>
      <div style={track}>
        <div style={{ ...fill, width: `${pct}%` }} />
      </div>
    </div>
  )
}

const track = {
  height: 8,
  width: '100%',
  background: 'var(--panel-2)',
  borderRadius: 99,
  overflow: 'hidden',
}

const fill = {
  height: '100%',
  background: 'var(--accent)',
  borderRadius: 99,
  transition: 'width 0.3s ease',
}
