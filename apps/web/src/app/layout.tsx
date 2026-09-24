import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '../components/theme-provider'
import { I18nProvider } from '../lib/i18n/i18n-context'

export const metadata: Metadata = {
  title: 'Metnex',
  description: 'AI-driven product starter',
  // TASK-027.61 — explicit alongside the app/icon.png file convention (which Next.js also picks
  // up automatically) so the favicon link is present in a way a unit test can assert directly,
  // rather than relying on Next's build-time file-convention scan.
  icons: { icon: '/icon.png' },
}

const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? ''

  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__METNEX_API_URL__=${JSON.stringify(apiUrl)};${themeScript}`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
