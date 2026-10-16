import { useCallback, useEffect, useRef, useState } from 'react'

/** Runs `load` when deps change; exposes data, error and a retry. Stale results are ignored. */
export function useAsync(load, deps) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  const run = useRef(0)
  const reload = useCallback(() => {
    const id = ++run.current
    setState((s) => ({ ...s, loading: true, error: null }))
    Promise.resolve()
      .then(load)
      .then((data) => id === run.current && setState({ data, error: null, loading: false }))
      .catch((error) => id === run.current && setState((s) => ({ ...s, error, loading: false })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { reload() }, [reload])
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) }
}
