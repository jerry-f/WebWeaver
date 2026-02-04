/**
 * SSE 任务状态订阅 API
 *
 * 前端通过 EventSource 订阅任务进度
 * Worker 通过 Redis Pub/Sub 发布状态更新
 */

import { NextRequest } from 'next/server'
import { createRedisConnection, CHANNELS, type JobStatusMessage } from '@/lib/queue/redis'

/**
 * GET /api/jobs/[id]/events
 *
 * SSE 端点，订阅指定任务的状态更新
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // 创建 Redis 订阅连接
      const subscriber = createRedisConnection()

      // 发送初始连接确认
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', jobId })}\n\n`)
      )

      // 订阅任务状态频道
      await subscriber.subscribe(CHANNELS.JOB_STATUS)

      // 消息处理
      const messageHandler = (channel: string, message: string) => {
        try {
          const data: JobStatusMessage = JSON.parse(message)

          // 只转发匹配的任务消息
          if (data.jobId === jobId) {
            controller.enqueue(encoder.encode(`data: ${message}\n\n`))

            // 任务完成或失败时关闭连接
            if (data.status === 'completed' || data.status === 'failed') {
              cleanup()
            }
          }
        } catch (error) {
          console.error('[SSE] Failed to parse message:', error)
        }
      }

      subscriber.on('message', messageHandler)

      // 超时保护（5 分钟）
      let isClosed = false
      const timeout = setTimeout(() => {
        if (isClosed) return
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'timeout', jobId })}\n\n`)
          )
        } catch {
          // 忽略
        }
        cleanup()
      }, 300000)

      // 清理函数
      const cleanup = async () => {
        if (isClosed) return
        isClosed = true
        clearTimeout(timeout)
        try {
          subscriber.off('message', messageHandler)
          await subscriber.unsubscribe(CHANNELS.JOB_STATUS)
          await subscriber.quit()
          controller.close()
        } catch {
          // 忽略清理错误
        }
      }

      // 客户端断开连接时清理
      request.signal.addEventListener('abort', () => {
        cleanup()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no' // 禁用 Nginx 缓冲
    }
  })
}
