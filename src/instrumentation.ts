/**
 * Next.js Instrumentation
 *
 * 此文件在 Next.js 服务端启动时执行一次
 * 用于初始化后台服务：Cron 调度器、BullMQ Workers
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // 仅在 Node.js 运行时执行（排除 Edge Runtime）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initApp } = await import('./lib/init')
    await initApp()
  }
}
