/**
 * Browserless 滚动加载测试
 *
 * 【功能说明】
 * 测试 Browserless 处理无限滚动和懒加载页面的能力
 * 这对于抓取社交媒体、新闻列表等页面非常重要
 *
 * 【什么是无限滚动？】
 * - 页面初始只加载部分内容
 * - 用户滚动到底部时自动加载更多
 * - 常见于：Twitter、Instagram、新闻网站
 *
 * 【什么是懒加载？】
 * - 图片和内容在进入视口时才加载
 * - 节省带宽和初始加载时间
 * - 需要滚动才能触发加载
 *
 * 【处理策略】
 * 1. 滚动到页面底部
 * 2. 等待新内容加载
 * 3. 重复直到达到目标或无更多内容
 *
 * 【运行方式】
 * npx tsx scripts/browserless/08-scroll-loading.ts
 */

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || 'http://localhost:3300'

/**
 * 测试用例：基础滚动加载
 *
 * 使用 Function API 实现滚动加载逻辑
 */
async function testBasicScroll(): Promise<void> {
  console.log('\n📜 测试 1: 基础滚动加载')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  const scrollCount = 3
  console.log(`目标 URL: ${url}`)
  console.log(`滚动次数: ${scrollCount}`)

  const code = `
    module.exports = async ({ page, context }) => {
      const { url, scrollCount, scrollDelay } = context;

      await page.goto(url, { waitUntil: 'networkidle2' });

      const results = [];

      // 记录初始状态
      const initialHeight = await page.evaluate(() => document.body.scrollHeight);
      const initialItems = await page.evaluate(() => document.querySelectorAll('.titleline').length);

      results.push({
        scroll: 0,
        height: initialHeight,
        items: initialItems
      });

      // 执行滚动
      for (let i = 0; i < scrollCount; i++) {
        // 滚动到底部
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        // 等待内容加载
        await new Promise(r => setTimeout(r, scrollDelay));

        // 记录状态
        const height = await page.evaluate(() => document.body.scrollHeight);
        const items = await page.evaluate(() => document.querySelectorAll('.titleline').length);

        results.push({
          scroll: i + 1,
          height,
          items
        });
      }

      // 回到顶部
      await page.evaluate(() => window.scrollTo(0, 0));

      return {
        data: {
          results,
          finalHeight: results[results.length - 1].height,
          finalItems: results[results.length - 1].items,
          heightIncrease: results[results.length - 1].height - initialHeight,
          itemsIncrease: results[results.length - 1].items - initialItems
        },
        type: 'application/json'
      };
    };
  `

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url, scrollCount, scrollDelay: 1000 }
    })
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const result = await response.json()
  const duration = Date.now() - startTime

  console.log(`\n✅ 滚动完成 (${duration}ms)\n`)
  console.log('滚动过程:')
  for (const r of result.results) {
    console.log(`  第 ${r.scroll} 次: 高度 ${r.height}px, 条目 ${r.items} 个`)
  }
  console.log(`\n总结:`)
  console.log(`  高度增加: ${result.heightIncrease}px`)
  console.log(`  条目增加: ${result.itemsIncrease} 个`)
}

/**
 * 测试用例：智能滚动（检测无更多内容）
 */
async function testSmartScroll(): Promise<void> {
  console.log('\n📜 测试 2: 智能滚动（自动检测结束）')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)
  console.log('策略: 当页面高度不再变化时停止滚动')

  const code = `
    module.exports = async ({ page, context }) => {
      const { url, maxScrolls, scrollDelay } = context;

      await page.goto(url, { waitUntil: 'networkidle2' });

      let previousHeight = 0;
      let scrollCount = 0;
      let noChangeCount = 0;

      while (scrollCount < maxScrolls && noChangeCount < 2) {
        // 获取当前高度
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);

        if (currentHeight === previousHeight) {
          noChangeCount++;
        } else {
          noChangeCount = 0;
        }

        previousHeight = currentHeight;

        // 滚动到底部
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        await new Promise(r => setTimeout(r, scrollDelay));
        scrollCount++;
      }

      const finalItems = await page.evaluate(() => {
        return document.querySelectorAll('.titleline').length;
      });

      return {
        data: {
          scrollCount,
          stoppedReason: noChangeCount >= 2 ? '页面高度不再变化' : '达到最大滚动次数',
          finalHeight: previousHeight,
          finalItems
        },
        type: 'application/json'
      };
    };
  `

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url, maxScrolls: 10, scrollDelay: 1000 }
    })
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const result = await response.json()
  const duration = Date.now() - startTime

  console.log(`\n✅ 智能滚动完成 (${duration}ms)`)
  console.log(`   实际滚动: ${result.scrollCount} 次`)
  console.log(`   停止原因: ${result.stoppedReason}`)
  console.log(`   最终高度: ${result.finalHeight}px`)
  console.log(`   内容条目: ${result.finalItems} 个`)
}

/**
 * 测试用例：懒加载图片处理
 */
async function testLazyImages(): Promise<void> {
  console.log('\n📜 测试 3: 懒加载图片处理')
  console.log('-'.repeat(40))

  const url = 'https://unsplash.com'
  console.log(`目标 URL: ${url}`)
  console.log('策略: 滚动页面以触发图片懒加载')

  const code = `
    module.exports = async ({ page, context }) => {
      const { url, scrollCount, scrollDelay } = context;

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      // 统计初始图片
      const initialImages = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img');
        let loaded = 0;
        let lazy = 0;

        imgs.forEach(img => {
          if (img.complete && img.naturalWidth > 0) {
            loaded++;
          }
          if (img.loading === 'lazy' || img.dataset.src) {
            lazy++;
          }
        });

        return { total: imgs.length, loaded, lazy };
      });

      // 滚动加载
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate((scrollStep) => {
          window.scrollBy(0, window.innerHeight * scrollStep);
        }, 0.8);

        await new Promise(r => setTimeout(r, scrollDelay));
      }

      // 统计最终图片
      const finalImages = await page.evaluate(() => {
        const imgs = document.querySelectorAll('img');
        let loaded = 0;

        imgs.forEach(img => {
          if (img.complete && img.naturalWidth > 0) {
            loaded++;
          }
        });

        return { total: imgs.length, loaded };
      });

      return {
        data: {
          initial: initialImages,
          final: finalImages,
          newImages: finalImages.total - initialImages.total,
          newLoaded: finalImages.loaded - initialImages.loaded
        },
        type: 'application/json'
      };
    };
  `

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url, scrollCount: 5, scrollDelay: 1500 }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    console.log(`⚠️ 请求失败: ${error.substring(0, 100)}`)
    return
  }

  const result = await response.json()
  const duration = Date.now() - startTime

  console.log(`\n✅ 懒加载测试完成 (${duration}ms)`)
  console.log(`\n初始状态:`)
  console.log(`  图片总数: ${result.initial?.total || 0}`)
  console.log(`  已加载: ${result.initial?.loaded || 0}`)
  console.log(`  懒加载标记: ${result.initial?.lazy || 0}`)
  console.log(`\n滚动后:`)
  console.log(`  图片总数: ${result.final?.total || 0}`)
  console.log(`  已加载: ${result.final?.loaded || 0}`)
  console.log(`  新增图片: ${result.newImages || 0}`)
}

/**
 * 测试用例：获取完整页面内容（滚动后）
 */
async function testFullContent(): Promise<void> {
  console.log('\n📜 测试 4: 获取滚动后的完整内容')
  console.log('-'.repeat(40))

  const url = 'https://news.ycombinator.com'
  console.log(`目标 URL: ${url}`)

  const code = `
    module.exports = async ({ page, context }) => {
      const { url, scrollCount, scrollDelay } = context;

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 滚动加载
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(r => setTimeout(r, scrollDelay));
      }

      // 回到顶部
      await page.evaluate(() => window.scrollTo(0, 0));

      // 获取页面内容
      const html = await page.content();

      return {
        data: html,
        type: 'text/html'
      };
    };
  `

  const startTime = Date.now()

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url, scrollCount: 3, scrollDelay: 1000 }
    })
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const html = await response.text()
  const duration = Date.now() - startTime

  // 统计内容
  const titleCount = (html.match(/class="titleline"/g) || []).length
  const linkCount = (html.match(/<a\s/gi) || []).length

  console.log(`\n✅ 内容获取成功 (${duration}ms)`)
  console.log(`   HTML 长度: ${html.length} 字符`)
  console.log(`   文章标题: ${titleCount} 个`)
  console.log(`   链接总数: ${linkCount} 个`)
}

/**
 * 测试用例：处理 data-src 懒加载属性
 */
async function testDataSrcLazy(): Promise<void> {
  console.log('\n📜 测试 5: 处理 data-src 懒加载属性')
  console.log('-'.repeat(40))

  console.log('说明: 许多网站使用 data-src 存储真实图片地址')
  console.log('需要在获取内容后手动替换 src 属性')

  const code = `
    module.exports = async ({ page, context }) => {
      const { url } = context;

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 查找并处理懒加载图片
      const lazyStats = await page.evaluate(() => {
        const lazyAttributes = [
          'data-src',
          'data-lazy-src',
          'data-original',
          'data-actualsrc'
        ];

        let processed = 0;
        const examples = [];

        document.querySelectorAll('img').forEach(img => {
          for (const attr of lazyAttributes) {
            const lazySrc = img.getAttribute(attr);
            if (lazySrc && (lazySrc.startsWith('http') || lazySrc.startsWith('/'))) {
              // 替换 src
              const oldSrc = img.src;
              img.src = lazySrc;
              processed++;

              if (examples.length < 3) {
                examples.push({
                  attr,
                  oldSrc: oldSrc.substring(0, 50),
                  newSrc: lazySrc.substring(0, 50)
                });
              }
              break;
            }
          }
        });

        return { processed, examples };
      });

      return {
        data: lazyStats,
        type: 'application/json'
      };
    };
  `

  const response = await fetch(`${BROWSERLESS_URL}/function`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      context: { url: 'https://example.com' }
    })
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const result = await response.json()

  console.log(`\n✅ 懒加载处理完成`)
  console.log(`   处理图片数: ${result.processed}`)
  if (result.examples?.length > 0) {
    console.log(`   示例:`)
    for (const ex of result.examples) {
      console.log(`     ${ex.attr}: ${ex.oldSrc} -> ${ex.newSrc}`)
    }
  } else {
    console.log(`   (该页面没有懒加载图片)`)
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('Browserless 滚动加载测试')
  console.log('='.repeat(60))
  console.log(`服务地址: ${BROWSERLESS_URL}`)
  console.log('\n本测试演示处理无限滚动和懒加载页面的技术')

  try {
    await testBasicScroll()
    await testSmartScroll()
    await testLazyImages()
    await testFullContent()
    await testDataSrcLazy()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
