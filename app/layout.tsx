import localFont from "next/font/local"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { Metadata } from "next"
import { DEFAULT_BRAND } from "@/lib/core/brand"

export const metadata: Metadata = {
  title: {
    default: `${DEFAULT_BRAND.name} · 客服中台`,
    template: `%s · ${DEFAULT_BRAND.name}`,
  },
  description: DEFAULT_BRAND.description,
}

// 字体随仓库分发，构建和运行均不依赖 Google Fonts。
const fontSans = localFont({
  src: "./fonts/geist-latin.woff2",
  weight: "100 900",
  variable: "--font-prayer-sans",
  display: "swap",
})

const fontMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  variable: "--font-prayer-mono",
  display: "swap",
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
      className={`${fontSans.variable} ${fontMono.variable}`}
      style={{ backgroundColor: "var(--background)" }}
    >
      <body className="min-h-svh bg-background text-foreground antialiased">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
