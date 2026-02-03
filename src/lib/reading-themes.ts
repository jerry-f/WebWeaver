// 阅读主题配置

export const READING_THEMES = {
  default: {
    name: '默认',
    description: '跟随系统主题',
  },
  sepia: {
    name: '羊皮纸',
    description: '温暖的米黄色调，适合长时间阅读',
  },
  eyecare: {
    name: '护眼绿',
    description: '柔和的绿色调，保护视力',
  },
  nightblue: {
    name: '夜间蓝',
    description: '深邃的蓝色调，适合夜间阅读',
  },
  paper: {
    name: '纸质白',
    description: '清晰明亮，接近印刷品',
  },
  warmnight: {
    name: '暖夜',
    description: '温暖的暗色调，舒适护眼',
  },
} as const

export type ReadingTheme = keyof typeof READING_THEMES
export const DEFAULT_READING_THEME: ReadingTheme = 'default'
export const STORAGE_KEY = 'newsflow-reading-theme'
