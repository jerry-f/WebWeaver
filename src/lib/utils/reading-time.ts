const WORDS_PER_MINUTE = 200
const CHINESE_CHARS_PER_MINUTE = 300

export function calculateReadingTime(content: string): number {
  if (!content) return 0

  const text = content.replace(/<[^>]*>/g, '').trim()
  if (!text) return 0

  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const englishWords = text
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0).length

  const chineseMinutes = chineseChars / CHINESE_CHARS_PER_MINUTE
  const englishMinutes = englishWords / WORDS_PER_MINUTE

  return Math.max(1, Math.ceil(chineseMinutes + englishMinutes))
}
