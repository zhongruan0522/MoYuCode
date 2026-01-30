import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { setToken, useToken } from '@/auth/token'

type LocationState = {
  from?: {
    pathname?: string
  }
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useToken()

  const fromPath = useMemo(() => {
    const state = location.state as LocationState | null
    return state?.from?.pathname || '/code'
  }, [location.state])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token) {
      navigate(fromPath, { replace: true })
    }
  }, [token, navigate, fromPath])

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const res = await api.auth.login({ username, password })
      setToken(res.accessToken)
      navigate(fromPath, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">登录</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          请输入管理员账号密码（服务端通过环境变量配置）
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm">用户名</label>
            <Input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="MOYU_ADMIN_USERNAME"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm">密码</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="MOYU_ADMIN_PASSWORD"
            />
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner className="size-4" /> 登录中…
              </>
            ) : (
              '登录'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
