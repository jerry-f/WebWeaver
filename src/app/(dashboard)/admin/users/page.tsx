'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Shield, User, Trash2 } from 'lucide-react'

interface UserData {
  id: string
  email: string
  name: string | null
  role: string
  createdAt: string
  _count: {
    subscriptions: number
    bookmarks: number
    readHistory: number
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else if (data.users) {
        setUsers(data.users)
      }
    } catch (err) {
      console.error('获取用户失败:', err)
      setError('获取用户失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleRoleChange = async (userId: string, newRole: string) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole })
    })
    fetchUsers()
  }

  const handleDelete = async (userId: string) => {
    if (!confirm('确定要删除此用户吗？')) return
    await fetch(`/api/admin/users?userId=${userId}`, { method: 'DELETE' })
    fetchUsers()
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            {error}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <Badge variant="secondary">{users.length} 个用户</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">用户</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">角色</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">订阅</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">收藏</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">已读</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">注册时间</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div>
                        <div className="font-medium">{user.name || '未设置'}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role === 'admin' ? (
                          <><Shield className="h-3 w-3 mr-1" />管理员</>
                        ) : (
                          <><User className="h-3 w-3 mr-1" />用户</>
                        )}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">{user._count.subscriptions}</td>
                    <td className="py-3 px-4">{user._count.bookmarks}</td>
                    <td className="py-3 px-4">{user._count.readHistory}</td>
                    <td className="py-3 px-4 text-muted-foreground">{formatDate(user.createdAt)}</td>
                    <td className="py-3 px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(user.id, user.role === 'admin' ? 'user' : 'admin')}
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            {user.role === 'admin' ? '设为普通用户' : '设为管理员'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(user.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            删除用户
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
