/**
 * 修复 sitecrawl 源配置，使用 browserless 策略
 * @description 该脚本用于将指定 sitecrawl 源的抓取策略更新为 browserless，并清除旧的爬取记录，以便重新爬取。
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function fix() {
  const source = await prisma.source.findFirst({
    where: { type: 'sitecrawl', url: 'https://code.claude.com/docs' }
  })

  if (!source) {
    console.log('未找到源')
    return
  }

  const config = source.config ? JSON.parse(source.config) : {}

  // 更新策略为 browserless
  config.fetch = {
    ...config.fetch,
    strategy: 'browserless'
  }

  await prisma.source.update({
    where: { id: source.id },
    data: { config: JSON.stringify(config) }
  })

  console.log('已更新配置:')
  console.log(JSON.stringify(config, null, 2))

  // 清除旧的爬取记录，以便重新爬取
  const deleted = await prisma.crawlUrl.deleteMany({
    where: { sourceId: source.id }
  })
  console.log(`\n已删除 ${deleted.count} 条 CrawlUrl 记录`)

  await prisma.$disconnect()
}

fix().catch(console.error)
