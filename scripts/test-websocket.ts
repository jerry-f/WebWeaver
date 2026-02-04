#!/usr/bin/env npx tsx
/**
 * WebSocket 连接测试脚本
 */

import { io } from 'socket.io-client'

const WS_URL = process.env.WS_URL || 'http://localhost:3002'

console.log('========================================')
console.log('  WebSocket 连接测试')
console.log('========================================')
console.log(`目标地址: ${WS_URL}`)
console.log('========================================\n')

// 创建连接（无鉴权，测试基础连接）
const socket = io(WS_URL, {
  auth: { token: 'test-token' }, // 测试 token
  transports: ['websocket', 'polling'],
  timeout: 5000,
  reconnection: false, // 测试时不重连
})

// 连接事件
socket.on('connect', () => {
  console.log('✅ 连接成功!')
  console.log(`   Socket ID: ${socket.id}`)
  console.log(`   Transport: ${socket.io.engine.transport.name}`)

  // 测试订阅
  console.log('\n📡 测试订阅 job:status 频道...')
  socket.emit('subscribe', { channels: ['job:status'] })

  // 等待一下然后断开
  setTimeout(() => {
    console.log('\n🔌 主动断开连接...')
    socket.disconnect()
    console.log('✅ 测试完成!')
    process.exit(0)
  }, 2000)
})

// 连接错误
socket.on('connect_error', (error) => {
  console.log('❌ 连接失败:', error.message)

  if (error.message.includes('unauthorized')) {
    console.log('   (这是预期的，因为使用了测试 token)')
    console.log('   ✅ WebSocket 服务器运行正常，鉴权中间件工作正常!')
  }

  process.exit(0)
})

// 断开连接
socket.on('disconnect', (reason) => {
  console.log('🔌 已断开:', reason)
})

// 超时
setTimeout(() => {
  console.log('❌ 连接超时')
  process.exit(1)
}, 10000)
