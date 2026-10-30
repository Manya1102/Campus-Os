import { useEffect, useState } from 'react'

// Loads data once when a page opens.
// Usage: const { data, setData, loading, error } = useFetch(api.getEvents)
// `setData` lets a page update its own copy after the user changes something.
export function useFetch(fetcher) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    fetcher()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [fetcher])

  return { data, setData, loading, error }
}
