#!/usr/bin/env npx tsx
/**
 * 站点凭证管理工具
 * 
 * 用法:
 *   npx tsx scripts/credentials.ts list              # 列出所有凭证
 *   npx tsx scripts/credentials.ts check             # 检测凭证有效性
 *   npx tsx scripts/credentials.ts add <domain>      # 添加凭证（交互式）
 *   npx tsx scripts/credentials.ts test <url>        # 测试抓取指定 URL
 */

import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { CredentialManager } from '../src/lib/auth/credential-manager'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
}

function success(msg: string) { console.log(`${COLORS.green}✓ ${msg}${COLORS.reset}`) }
function fail(msg: string) { console.log(`${COLORS.red}✗ ${msg}${COLORS.reset}`) }
function info(msg: string) { console.log(`${COLORS.blue}→ ${msg}${COLORS.reset}`) }
function warn(msg: string) { console.log(`${COLORS.yellow}! ${msg}${COLORS.reset}`) }

const configPath = path.join(process.cwd(), 'config/site-credentials.json')
const credentialsDir = path.join(process.cwd(), 'config/credentials')

// 确保目录存在
if (!fs.existsSync(credentialsDir)) {
  fs.mkdirSync(credentialsDir, { recursive: true })
}

/**
 * 列出所有凭证
 */
async function listCredentials() {
  console.log(`\n${COLORS.blue}=== 站点凭证列表 ===${COLORS.reset}\n`)
  
  const manager = new CredentialManager()
  const domains = manager.getAuthenticatedDomains()
  
  if (domains.length === 0) {
    warn('未配置任何凭证')
    console.log(`\n配置文件: ${configPath}`)
    return
  }
  
  // 去重并获取主域名
  const uniqueDomains = [...new Set(domains.map(d => d.replace(/^www\./, '')))]
  
  for (const domain of uniqueDomains) {
    const cookie = manager.getCookieForDomain(domain)
    
    if (cookie) {
      console.log(`${COLORS.green}●${COLORS.reset} ${domain}`)
      console.log(`  ${COLORS.gray}Cookie 长度: ${cookie.length} 字符${COLORS.reset}`)
      
      // 解析关键 Cookie
      const cookies = cookie.split('; ').map(c => c.split('=')[0])
      const keyCookies = cookies.filter(c => 
        ['z_c0', 'sid', 'session', 'token', 'auth'].some(k => c.toLowerCase().includes(k))
      )
      if (keyCookies.length > 0) {
        console.log(`  ${COLORS.gray}关键字段: ${keyCookies.join(', ')}${COLORS.reset}`)
      }
    } else {
      console.log(`${COLORS.red}○${COLORS.reset} ${domain} (未配置 Cookie)`)
    }
  }
  
  console.log(`\n总计: ${uniqueDomains.length} 个站点`)
}

/**
 * 检测凭证有效性
 */
async function checkCredentials() {
  console.log(`\n${COLORS.blue}=== 凭证有效性检测 ===${COLORS.reset}\n`)
  
  const manager = new CredentialManager()
  const domains = [...new Set(manager.getAuthenticatedDomains().map(d => d.replace(/^www\./, '')))]
  
  // 测试配置
  const testUrls: Record<string, { url: string; name: string }> = {
    'zhihu.com': { url: 'https://zhuanlan.zhihu.com/p/493407868', name: '知乎文章' },
    'medium.com': { url: 'https://medium.com/me/settings', name: 'Medium 设置页' },
    'juejin.cn': { url: 'https://juejin.cn/user/center/signin', name: '掘金签到页' },
  }
  
  let valid = 0
  let invalid = 0
  
  for (const domain of domains) {
    const cookie = manager.getCookieForDomain(domain)
    if (!cookie) {
      fail(`${domain}: 未找到 Cookie`)
      invalid++
      continue
    }
    
    const test = testUrls[domain]
    if (!test) {
      success(`${domain}: Cookie 已配置 (${cookie.length} 字符)`)
      console.log(`  ${COLORS.gray}无测试 URL，跳过有效性验证${COLORS.reset}`)
      valid++
      continue
    }
    
    info(`测试 ${domain}...`)
    
    try {
      const res = await fetch('http://localhost:8088/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: test.url,
          headers: { Cookie: cookie }
        }),
        signal: AbortSignal.timeout(15000)
      })
      
      const data = await res.json()
      
      if (data.title && !data.error) {
        success(`${domain}: 凭证有效 ✓`)
        valid++
      } else {
        fail(`${domain}: 凭证可能已过期`)
        console.log(`  ${COLORS.gray}错误: ${data.error || '无法获取内容'}${COLORS.reset}`)
        invalid++
      }
    } catch (e: any) {
      fail(`${domain}: 测试异常 - ${e.message}`)
      invalid++
    }
  }
  
  console.log(`\n结果: ${COLORS.green}${valid} 有效${COLORS.reset}, ${COLORS.red}${invalid} 无效${COLORS.reset}`)
}

/**
 * 测试抓取指定 URL
 */
async function testUrl(url: string) {
  console.log(`\n${COLORS.blue}=== 测试抓取 ===${COLORS.reset}\n`)
  info(`URL: ${url}`)
  
  const manager = new CredentialManager()
  const cookie = manager.getCookieForUrl(url)
  
  if (cookie) {
    console.log(`${COLORS.gray}🔐 使用 Cookie (${cookie.length} 字符)${COLORS.reset}`)
  } else {
    console.log(`${COLORS.gray}无 Cookie，直接抓取${COLORS.reset}`)
  }
  
  try {
    const start = Date.now()
    const res = await fetch('http://localhost:8088/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        headers: cookie ? { Cookie: cookie } : undefined
      }),
      signal: AbortSignal.timeout(30000)
    })
    
    const data = await res.json()
    const duration = Date.now() - start
    
    if (data.error) {
      fail(`抓取失败: ${data.error}`)
      return
    }
    
    success(`抓取成功 (${duration}ms)`)
    console.log(`\n${COLORS.blue}结果:${COLORS.reset}`)
    console.log(`  标题: ${data.title || '(无)'}`)
    console.log(`  策略: ${data.strategy}`)
    console.log(`  内容长度: ${data.textContent?.length || 0} 字符`)
    
    if (data.textContent) {
      console.log(`\n${COLORS.blue}内容预览:${COLORS.reset}`)
      console.log(`  ${data.textContent.slice(0, 200)}...`)
    }
  } catch (e: any) {
    fail(`异常: ${e.message}`)
  }
}

/**
 * 添加新凭证
 */
async function addCredential(domain: string) {
  console.log(`\n${COLORS.blue}=== 添加站点凭证 ===${COLORS.reset}\n`)
  info(`域名: ${domain}`)
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  const question = (prompt: string): Promise<string> => {
    return new Promise(resolve => rl.question(prompt, resolve))
  }
  
  console.log(`\n请从浏览器复制 Cookie:`)
  console.log(`  1. 打开 ${domain} 并登录`)
  console.log(`  2. F12 → Application → Cookies`)
  console.log(`  3. 全选复制所有 Cookie 值`)
  console.log(``)
  
  const cookie = await question('粘贴 Cookie 字符串: ')
  
  if (!cookie.trim()) {
    fail('Cookie 不能为空')
    rl.close()
    return
  }
  
  // 保存 Cookie 文件
  const cookieFile = `credentials/${domain.replace(/\./g, '-')}-cookie.txt`
  const cookiePath = path.join(process.cwd(), 'config', cookieFile)
  fs.writeFileSync(cookiePath, cookie.trim())
  success(`Cookie 已保存: ${cookiePath}`)
  
  // 更新配置文件
  let config: any = { credentials: {} }
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }
  
  config.credentials[domain] = {
    enabled: true,
    authType: 'cookie',
    cookieFile,
    domains: [domain, `www.${domain}`],
    lastUpdated: new Date().toISOString()
  }
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  success(`配置已更新: ${configPath}`)
  
  rl.close()
  
  console.log(`\n${COLORS.green}✓ 凭证添加完成！${COLORS.reset}`)
  console.log(`运行 ${COLORS.blue}npx tsx scripts/credentials.ts check${COLORS.reset} 验证凭证有效性`)
}

/**
 * 显示帮助
 */
function showHelp() {
  console.log(`
${COLORS.blue}站点凭证管理工具${COLORS.reset}

用法:
  npx tsx scripts/credentials.ts <command> [options]

命令:
  list                列出所有已配置的凭证
  check               检测凭证有效性
  add <domain>        添加新站点凭证（交互式）
  test <url>          测试抓取指定 URL

示例:
  npx tsx scripts/credentials.ts list
  npx tsx scripts/credentials.ts check
  npx tsx scripts/credentials.ts add zhihu.com
  npx tsx scripts/credentials.ts test https://zhuanlan.zhihu.com/p/123456

配置文件:
  ${configPath}
  ${credentialsDir}/
`)
}

// 主函数
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]
  
  switch (command) {
    case 'list':
    case 'ls':
      await listCredentials()
      break
      
    case 'check':
    case 'verify':
      await checkCredentials()
      break
      
    case 'add':
      if (!args[1]) {
        fail('请指定域名: npx tsx scripts/credentials.ts add <domain>')
        process.exit(1)
      }
      await addCredential(args[1])
      break
      
    case 'test':
      if (!args[1]) {
        fail('请指定 URL: npx tsx scripts/credentials.ts test <url>')
        process.exit(1)
      }
      await testUrl(args[1])
      break
      
    case 'help':
    case '--help':
    case '-h':
      showHelp()
      break
      
    default:
      if (command) {
        fail(`未知命令: ${command}`)
      }
      showHelp()
      process.exit(command ? 1 : 0)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
