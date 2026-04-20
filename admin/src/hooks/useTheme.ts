import * as React from "react"

type Theme = "dark" | "light"

interface UseThemeReturn {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("cortex_theme") as Theme | null
      if (stored) return stored
      return "light"
    }
    return "light"
  })

  React.useEffect(() => {
    const root = document.documentElement
    if (theme === "light") {
      root.classList.add("light")
    } else {
      root.classList.remove("light")
    }
    localStorage.setItem("cortex_theme", theme)
  }, [theme])

  const toggleTheme = React.useCallback(() => {
    setThemeState(t => t === "dark" ? "light" : "dark")
  }, [])

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t)
  }, [])

  return { theme, toggleTheme, setTheme }
}