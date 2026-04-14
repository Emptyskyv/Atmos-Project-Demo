import type { Metadata } from 'next'
import { AppProviders } from '@/src/frontend/components/providers/AppProviders'

export const metadata: Metadata = {
  title: 'Atoms',
  description: 'Atoms is an AI Web App generator powered by OpenAI GPT-5.2.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
