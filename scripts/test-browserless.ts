/**
 * 使用 browserless 策略测试链接发现
 */

import { getUnifiedFetcher } from '../src/lib/fetchers/unified-fetcher'
import { extractLinks } from '../src/lib/fetchers/sitecrawl'
import type { SiteCrawlConfig } from '../src/lib/fetchers/types'

async function debug() {
  const url = 'https://code.claude.com/docs'

  console.log(`使用 browserless 策略抓取页面: ${url}\n`)

  const fetcher = getUnifiedFetcher()
  const result = await fetcher.fetch(url, {
    timeout: 60000,
    /**
     * 抓取策略类型
     * - auto: 自动选择（优先 Go Scraper）
     * - go: 强制使用 Go Scraper
     * - browserless: 强制使用浏览器渲染
     * - local: 强制使用本地抓取
     */
    strategy: 'browserless'  // 强制使用 browserless 策略,

  })

  console.log('抓取结果:')
  console.log(`  success: ${result.success}`)
  console.log(`  strategy: ${result.strategy}`)
  console.log(`  duration: ${result.duration}ms`)
  console.log(`  content length: ${result.content?.length || 0}`)
  console.log(`  error: ${result.error || 'none'}`)

  if (result.content) {
    // 显示内容前 800 字符
    console.log('\n内容前 800 字符:')
    console.log(result.content.substring(0, 800))
    console.log('...\n')

    // 尝试提取链接
    const config: SiteCrawlConfig = {
      sameDomainOnly: false,
      maxDepth: 3,
      maxUrls: 1000
    }

    const links = extractLinks(result.content, url, config)
    console.log(`发现链接数: ${links.length}`)

    if (links.length > 0) {
      console.log('\n前 20 个链接:')
      for (const link of links.slice(0, 20)) {
        console.log(`  - ${link.url}`)
      }
    }
  }

  process.exit(0)
}

debug().catch(console.error)
