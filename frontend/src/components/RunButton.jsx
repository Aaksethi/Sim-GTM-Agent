// RunButton: kicks off the pipeline. Disabled when there's nothing to run or a
// run is already in progress; shows a spinner while loading.
export default function RunButton({ onClick, disabled, isLoading }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...btn,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {isLoading ? (
        <>
          <span style={spinner} />
          Running…
        </>
      ) : (
        'Run GTM Pipeline'
      )}
    </button>
  )
}

const btn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  background: 'var(--accent)',
  color: '#0f0f0f',
  border: 'none',
  borderRadius: 9,
  padding: '11px 20px',
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: 0.2,
}

const spinner = {
  width: 15,
  height: 15,
  border: '2px solid rgba(15,15,15,0.35)',
  borderTopColor: '#0f0f0f',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
  display: 'inline-block',
}
