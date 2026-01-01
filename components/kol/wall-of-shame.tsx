"use client"

import Image from "next/image"
import { Skull, Ban } from "lucide-react"
import { getWashTraders } from "@/lib/kol-data"

export function WallOfShame() {
  const washTraders = getWashTraders()

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--red)]/5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[var(--red)]/20 rounded-lg">
            <Skull className="w-5 h-5 text-[var(--red)]" />
          </div>
          <div>
            <h3 className="font-bold text-[var(--text-primary)]">WALL OF SHAME</h3>
            <p className="text-[10px] text-[var(--text-muted)]">KOLs who dump on copy traders</p>
          </div>
        </div>
      </div>

      {/* Shame List */}
      <div className="flex-1 overflow-y-auto">
        {washTraders.map((kol) => (
          <div key={kol.id} className="p-4 border-b border-[var(--border-subtle)] bg-[var(--red)]/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Image
                    src={kol.avatar}
                    alt={kol.name}
                    width={48}
                    height={48}
                    className="rounded-full grayscale border-2 border-[var(--red)]/50 bg-[var(--bg-secondary)]"
                    unoptimized
                  />
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-[var(--red)] rounded-full flex items-center justify-center">
                    <Ban className="w-3 h-3 text-white" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)]">{kol.name}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-[var(--red)] text-white rounded font-bold">BLACKLIST</span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">@{kol.twitter}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-[var(--red)]">{kol.washScore}%</div>
                <div className="text-[10px] text-[var(--text-muted)]">SCAM SCORE</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[var(--bg-secondary)] rounded-lg p-2">
                <div className="text-[var(--red)] font-bold">{kol.dumpOnFollowers}</div>
                <div className="text-[10px] text-[var(--text-muted)]">Dumps</div>
              </div>
              <div className="bg-[var(--bg-secondary)] rounded-lg p-2">
                <div className="text-[var(--red)] font-bold">{kol.copyTraders}</div>
                <div className="text-[10px] text-[var(--text-muted)]">Victims</div>
              </div>
              <div className="bg-[var(--bg-secondary)] rounded-lg p-2">
                <div className="text-[var(--red)] font-bold">{kol.coordinationScore}%</div>
                <div className="text-[10px] text-[var(--text-muted)]">Coord</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {["Pump & Dump", "Wash Trading", "Exit Liquidity"].slice(0, 2).map((tag) => (
                <span key={tag} className="text-[10px] px-2 py-0.5 bg-[var(--red)]/20 text-[var(--red)] rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

