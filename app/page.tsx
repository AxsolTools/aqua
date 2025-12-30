import { Header } from "@/components/layout/header"
import { TokenFilters } from "@/components/discovery/token-filters"
import { TokenGrid } from "@/components/discovery/token-grid"
import { GlobalPourEffect } from "@/components/visuals/global-pour-effect"

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <GlobalPourEffect />
      <Header />

      {/* Main Content - No hero, straight to tokens like pump.fun */}
      <section className="px-4 sm:px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <TokenFilters />
          <TokenGrid />
        </div>
      </section>
    </main>
  )
}
