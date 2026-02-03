'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Palette, Check } from 'lucide-react'
import { useReadingTheme } from '@/contexts/reading-theme-context'
import { READING_THEMES, ReadingTheme } from '@/lib/reading-themes'
import { cn } from '@/lib/utils'

// 主题预览颜色
const THEME_COLORS: Record<ReadingTheme, { bg: string; text: string }> = {
  default: { bg: 'bg-gradient-to-r from-gray-200 to-gray-700', text: '' },
  sepia: { bg: 'bg-[#f4ecd8]', text: 'text-[#5c4b37]' },
  eyecare: { bg: 'bg-[#c7e6c1]', text: 'text-[#2d4a2d]' },
  nightblue: { bg: 'bg-[#1a1f2e]', text: 'text-[#b8c5d6]' },
  paper: { bg: 'bg-[#fefefe] border border-gray-300', text: 'text-[#1a1a1a]' },
  warmnight: { bg: 'bg-[#2b2420]', text: 'text-[#e8dcd0]' },
}

export function ReadingThemePicker() {
  const { theme, setTheme } = useReadingTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          title="阅读主题"
        >
          <Palette className="w-4 h-4" />
          <span className="ml-1 text-xs hidden sm:inline">主题</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {(Object.keys(READING_THEMES) as ReadingTheme[]).map((key) => (
          <DropdownMenuItem
            key={key}
            onClick={() => setTheme(key)}
            className={cn(
              "flex items-center gap-3 cursor-pointer py-2",
              theme === key && "bg-accent"
            )}
          >
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
              THEME_COLORS[key].bg
            )}>
              {theme === key && <Check className={cn("w-3 h-3", key === 'default' ? 'text-white' : THEME_COLORS[key].text)} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{READING_THEMES[key].name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {READING_THEMES[key].description}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
