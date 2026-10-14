import localFont from "next/font/local"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Metadata } from "next"
import { DEFAULT_BRAND } from "@/lib/brand"

export const metadata: Metadata = {
  title: {
    default: `${DEFAULT_BRAND.name} · 客服中台`,
    template: `%s · ${DEFAULT_BRAND.name}`,
  },
  description: DEFAULT_BRAND.description,
}

// 字体文件随仓库分发(next/font/local),不用 next/font/google:
// 构建期下载只走本机,服务器连不上 fonts.googleapis.com,构建会直接失败。
// 两个文件都是从 Google Fonts 取的 latin 子集可变字体,字重覆盖与原来一致。
const fontSans = localFont({
  src: "./fonts/geist-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-sans",
})

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        "font-mono",
        jetbrainsMono.variable
      )}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
