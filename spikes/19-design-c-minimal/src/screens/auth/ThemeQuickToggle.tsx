/**
 * A one-click light/dark toggle for screens without the app shell (sign-in, reset). It flips the
 * resolved theme and remembers the explicit choice.
 */
import { Moon, Sun } from 'lucide-react'
import { Button } from '../../components/ui/button.tsx'
import { useTheme } from '../../lib/theme.tsx'

export function ThemeQuickToggle() {
  const { resolved, setMode } = useTheme()
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <Button variant="ghost" size="icon" aria-label={`Switch to ${next} theme`} onClick={() => setMode(next)}>
      {resolved === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  )
}
