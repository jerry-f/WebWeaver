'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { ReadingTheme, DEFAULT_READING_THEME, STORAGE_KEY, READING_THEMES } from '@/lib/reading-themes'

interface ReadingThemeContextType {
  theme: ReadingTheme
  setTheme: (theme: ReadingTheme) => void
}

const ReadingThemeContext = createContext<ReadingThemeContextType>({
  theme: DEFAULT_READING_THEME,
  setTheme: () => {},
})

export function ReadingThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ReadingTheme>(DEFAULT_READING_THEME)
  const [mounted, setMounted] = useState(false)

  // 从 localStorage 读取主题
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ReadingTheme
    if (stored && stored in READING_THEMES) {
      setThemeState(stored)
    }
    setMounted(true)
  }, [])

  // 设置主题并保存到 localStorage
  const setTheme = useCallback((newTheme: ReadingTheme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }, [])

  // 防止 hydration 不匹配，但始终提供 context value
  const value = { theme, setTheme }

  if (!mounted) {
    return (
      <ReadingThemeContext.Provider value={value}>
        <div  data-reading-theme={DEFAULT_READING_THEME} className="reading-theme-container reading-theme-context-wrapper">
          {children}
        </div>
      </ReadingThemeContext.Provider>
    )
  }

  return (
    <ReadingThemeContext.Provider value={value}>
      <div data-reading-theme={theme} className="reading-theme-container reading-theme-context-wrapper">
        {children}
      </div>
    </ReadingThemeContext.Provider>
  )
}

export function useReadingTheme() {
  return useContext(ReadingThemeContext)
}
