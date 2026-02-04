/**
 * Browserless 健康检查测试
 *
 * 【功能说明】
 * 检查 Browserless 服务的运行状态和资源使用情况
 *
 * 【运行方式】
 * npx tsx scripts/browserless/01-health-check.ts
 */

import { BrowserlessClient } from './utils/browserless-client'

async function main() {
  console.log('='.repeat(60))
  console.log('Browserless 健康检查测试')
  console.log('='.repeat(60))

  const client = new BrowserlessClient()

  try {
    const health = await client.checkHealth()

    console.log('\n✅ 服务状态: 正常运行\n')
    console.log('资源使用情况:')
    console.log(`  CPU 使用率:    ${health.cpu}%`)
    console.log(`  内存使用率:    ${health.memory}%`)
    console.log('')
    console.log('会话状态:')
    console.log(`  当前运行数:    ${health.running}/${health.maxConcurrent}`)
    console.log(`  排队等待数:    ${health.queued}`)
    console.log('')
    console.log('服务可用性:')
    console.log(`  是否可用:      ${health.isAvailable ? '✅ 是' : '❌ 否'}`)

    console.log('\n' + '-'.repeat(40))
    if (health.cpu > 80 || health.memory > 80) {
      console.log('⚠️  警告: 资源使用率较高，建议减少并发请求')
    } else if (health.queued > 0) {
      console.log('⚠️  提示: 有请求在排队，可能需要等待')
    } else {
      console.log('✅ 服务状态良好，可以正常使用')
    }

  } catch (error) {
    console.log('\n❌ 服务状态: 无法连接\n')
    console.log(`错误原因: ${error instanceof Error ? error.message : '未知错误'}`)
    console.log('\n解决方案:')
    console.log('  1. 检查 Docker 容器: docker ps | grep browserless')
    console.log('  2. 启动服务: docker-compose up -d browserless')
    console.log('  3. 查看日志: docker logs newsflow-browserless')
    process.exit(1)
  }

  console.log('\n' + '='.repeat(60))
}

main()
