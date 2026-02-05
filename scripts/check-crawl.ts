/**
 * 检查 sitecrawl 记录
 * @description 该脚本用于检查数据库中 sitecrawl 类型的源及其相关的 CrawlUrl 和文章记录，帮助调试和验证爬取配置。
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function check() {
  // 查找 sitecrawl 类型的源
  const sources = await prisma.source.findMany({
    where: { type: 'sitecrawl' },
    select: { id: true, name: true, url: true, config: true }
  })
  console.log('Sitecrawl 源:')
  for (const s of sources) {
    console.log(`  - ${s.name}: ${s.url}`)
    console.log(`    config: ${s.config}`)
  }

  // 查找 CrawlUrl 记录
  for (const source of sources) {
    const crawlUrls = await prisma.crawlUrl.findMany({
      where: { sourceId: source.id },
      take: 10
    })
    console.log(`\n${source.name} 的 CrawlUrl 记录数: ${crawlUrls.length}`)
    if (crawlUrls.length > 0) {
      for (const url of crawlUrls.slice(0, 5)) {
        console.log(`  - [${url.status}] depth=${url.depth}: ${url.url}`)
      }
    }

    // 查找关联的文章
    const articles = await prisma.article.count({
      where: { sourceId: source.id }
    })
    console.log(`${source.name} 的文章数: ${articles}`)
  }

  await prisma.$disconnect()
}

check().catch(console.error)
