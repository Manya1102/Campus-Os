// Shown while a page is loading or when the page could not be loaded.
function PageStatus({ loading, error }) {
  if (loading) {
    return (
      <p role="status" style={{ padding: '24px 0', opacity: 0.7 }}>
        Loading...
      </p>
    )
  }

  if (error) {
    return (
      <p role="alert" style={{ padding: '24px 0', color: '#b91c1c' }}>
        Could not load this page: {error}
      </p>
    )
  }

  return null
}

// A small message for when saving a change fails (the page rolls the change back).
export function ActionError({ message }) {
  if (!message) return null

  return (
    <p role="alert" style={{ margin: '12px 0', color: '#b91c1c' }}>
      {message}
    </p>
  )
}

export default PageStatus
