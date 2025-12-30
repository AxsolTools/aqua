import type React from "react"
import type { Metadata, Viewport } from "next"
import { Space_Grotesk, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/components/providers/auth-provider"
import { WalletOnboarding } from "@/components/wallet/wallet-onboarding"
import { LiquidBackground } from "@/components/visuals/liquid-background"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Aquarius | Infinite Liquidity Launchpad",
  description:
    "The next-generation Solana token launchpad with continuous liquidity flow. Pour Rate technology ensures your token never runs dry.",
  keywords: [
    "solana",
    "launchpad",
    "liquidity",
    "defi",
    "token",
    "crypto",
    "aquarius",
    "pump.fun",
    "infinite liquidity",
  ],
  authors: [{ name: "Aquarius" }],
  icons: {
    icon: [
      { url: "/favicon.jpg", sizes: "32x32", type: "image/jpeg" },
      { url: "/aquarius-logo.svg", type: "image/svg+xml" },
    ],
    apple: "/logo-192.jpg",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Aquarius | Infinite Liquidity Launchpad",
    description:
      "The next-generation Solana token launchpad with continuous liquidity flow. Pour Rate technology keeps liquidity flowing eternally.",
    type: "website",
    siteName: "Aquarius Launchpad",
    images: ["/logo-512.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aquarius | Infinite Liquidity Launchpad",
    description: "Pour Rate technology ensures your token never runs dry",
    images: ["/logo-512.jpg"],
  },
    generator: 'v0.app'
}

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <AuthProvider>
          <LiquidBackground />
          {children}
          <WalletOnboarding />
        </AuthProvider>
      </body>
    </html>
  )
}
