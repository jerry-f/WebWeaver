import { withAuth } from "next-auth/middleware"

export default withAuth({
  pages: {
    signIn: "/login",
  },
})

// 保护这些路由，未登录用户会被重定向到 /login
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/articles/:path*",
    "/sources/:path*",
    "/subscriptions/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
}
