import { useContext, useEffect, useRef } from 'react'
import { UNSAFE_NavigationContext, useLocation } from 'react-router-dom'

export function useUnsavedOntologyChanges(dirty: boolean, saving: boolean, requestLeave: (leave: () => void) => void) {
  const { navigator } = useContext(UNSAFE_NavigationContext)
  const location = useLocation()
  const state = useRef({ dirty, saving, pathname: location.pathname, requestLeave })
  state.current = { dirty, saving, pathname: location.pathname, requestLeave }

  useEffect(() => {
    const push = navigator.push
    const replace = navigator.replace
    let previousIndex = Number(window.history.state?.idx || 0)
    let restoring = false
    const wrap = (original: typeof navigator.push): typeof navigator.push => (to, ...args) => {
      const path = typeof to === 'string' ? to.split('?')[0] : to.pathname
      const leave = () => {
        original.call(navigator, to, ...args)
        previousIndex = Number(window.history.state?.idx || 0)
      }
      if (path && path !== state.current.pathname) {
        if (state.current.saving) return
        if (state.current.dirty) { state.current.requestLeave(leave); return }
      }
      leave()
    }
    const guardedPush = wrap(push)
    const guardedReplace = wrap(replace)
    navigator.push = guardedPush
    navigator.replace = guardedReplace
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!state.current.dirty && !state.current.saving) return
      event.preventDefault()
      event.returnValue = ''
    }
    const popState = (event: PopStateEvent) => {
      const nextIndex = Number(event.state?.idx || 0)
      if (restoring) { restoring = false; previousIndex = nextIndex; event.stopImmediatePropagation(); return }
      const path = window.location.hash.slice(1).split('?')[0] || '/'
      if (path !== state.current.pathname && nextIndex !== previousIndex && (state.current.dirty || state.current.saving)) {
        const delta = nextIndex - previousIndex
        restoring = true
        event.stopImmediatePropagation()
        window.history.go(-delta)
        if (!state.current.saving) state.current.requestLeave(() => {
          state.current.dirty = false
          navigator.go(delta)
        })
        return
      }
      previousIndex = nextIndex
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('popstate', popState, true)
    return () => {
      if (navigator.push === guardedPush) navigator.push = push
      if (navigator.replace === guardedReplace) navigator.replace = replace
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('popstate', popState, true)
    }
  }, [navigator])

  return () => { state.current.dirty = false }
}
