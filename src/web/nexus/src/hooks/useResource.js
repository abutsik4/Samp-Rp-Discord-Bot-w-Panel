import { useCallback, useEffect, useRef, useState } from 'react'

// Hook for fetching async resources from the panel API.
// Re-runs when any value in `deps` changes. Returns { data, loading, error, refetch }.
// Pass `enabled: false` to skip the fetch entirely (e.g. while bot key is unset).
export function useResource(fn, deps = [], { enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)
  const cancelRef = useRef(false)

  const run = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    cancelRef.current = false
    setLoading(true)
    setError(null)
    try {
      const result = await fn()
      if (!cancelRef.current) setData(result)
    } catch (e) {
      if (!cancelRef.current) { setError(e); setData(null) }
    } finally {
      if (!cancelRef.current) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps.concat([enabled]))

  useEffect(() => {
    run()
    return () => { cancelRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  return { data, loading, error, refetch: run, setData }
}
