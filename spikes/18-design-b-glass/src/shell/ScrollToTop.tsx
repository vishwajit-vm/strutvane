/**
 * Scroll to the top when the path changes (not when only the query string changes, so list
 * filters and pagination keep the user's place).
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router'

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}
