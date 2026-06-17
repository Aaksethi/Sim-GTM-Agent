// RunButton: runs the whole pipeline (scores every loaded account live, in order).
// Solid amber — the primary action. Spinner + "Scoring…" while running.
export default function RunButton({ onClick, disabled, isLoading }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...btn,
        opacity: disabled && !isLoading ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {isLoading ? (
        <>
          <span style={spinner} />
          Scoring…
        </>
      ) : (
        '▶  Run pipeline'
      )}
    </button>
  )
}

const btn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--accent)',
  color: '#ffffff',
  border: 'none',
  borderRadius: 9,
  padding: '9px 18px',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.1,
  boxShadow: '0 1px 3px rgba(245,158,11,0.4)',
  fontFamily: 'inherit',
}

const spinner = {
  width: 14,
  height: 14,
  border: '2px solid rgba(26,26,26,0.3)',
  borderTopColor: '#1a1a1a',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
  display: 'inline-block',
}
