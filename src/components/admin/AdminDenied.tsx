import Link from 'next/link'
import { LogIn, ShieldAlert } from 'lucide-react'

/**
 * Rendered by the admin layout when the visitor is not an admin
 * (v0.16 A1). No detail about WHO is admin leaks — just the two states:
 * not signed in, or signed in without access.
 */
export function AdminDenied({ signedIn, username }: { signedIn: boolean; username?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {signedIn ? <ShieldAlert size={22} className="text-muted-foreground" /> : <LogIn size={22} className="text-muted-foreground" />}
        </div>
        <h1 className="text-lg font-semibold">
          {signedIn ? '无管理员权限' : '需要登录'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {signedIn ? (
            <>
              账号 <span className="font-medium text-foreground">{username}</span> 在此实例上没有管理员权限。
            </>
          ) : (
            '管理控制台需要已登录的管理员账号。'
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          管理员权限通过 <code className="rounded bg-muted px-1">CANVIX_ADMIN_USERS</code> 环境变量设置，
          或由另一位管理员授予。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
        >
          返回 Canvix
        </Link>
      </div>
    </div>
  )
}
