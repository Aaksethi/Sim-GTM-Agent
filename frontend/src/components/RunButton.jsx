// RunButton: triggers a full live re-run of every account. Secondary / outline
// style, since the pre-loaded results are the default. Spinner while running.
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
          Re-running…
        </>
      ) : (
        '↻ Re-run all'
      )}
    </button>
  )
}

const btn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 9,
  background: '#fff',
  color: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 9,
  padding: '9px 16px',
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 0.2,
}

const spinner = {
  width: 14,
  height: 14,
  border: '2px solid rgba(79,70,229,0.3)',
  borderTopColor: 'var(--accent)',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
  display: 'inline-block',
}
