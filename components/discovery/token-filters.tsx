"use client"

import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

const stages = [
  { value: "all", label: "All Tokens" },
  { value: "rising", label: "Rising Tides" },
  { value: "bonding", label: "Bonding" },
  { value: "migrated", label: "Deep Water" },
]

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "liquidity", label: "Liquidity" },
  { value: "volume", label: "Volume" },
  { value: "marketcap", label: "Market Cap" },
]

interface TokenFiltersProps {
  onFilterChange?: (filters: { stage: string; sort: string; search: string }) => void
}

export function TokenFilters({ onFilterChange }: TokenFiltersProps) {
  const [stage, setStage] = useState("all")
  const [sort, setSort] = useState("newest")
  const [search, setSearch] = useState("")
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      const activeIndex = stages.findIndex((s) => s.value === stage)
      const buttons = containerRef.current.querySelectorAll("button")
      const activeButton = buttons[activeIndex] as HTMLElement
      if (activeButton) {
        setIndicatorStyle({
          left: activeButton.offsetLeft,
          width: activeButton.offsetWidth,
        })
      }
    }
  }, [stage])

  const handleStageChange = (value: string) => {
    setStage(value)
    onFilterChange?.({ stage: value, sort, search })
  }

  const handleSortChange = (value: string) => {
    setSort(value)
    onFilterChange?.({ stage, sort: value, search })
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    onFilterChange?.({ stage, sort, search: value })
  }

  return (
    <div className="mb-6">
      {/* Top row: Tabs + Search + Sort */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        {/* Stage Tabs */}
        <div
          ref={containerRef}
          className="relative flex gap-0.5 p-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] overflow-x-auto"
        >
          {/* Active indicator */}
          <motion.div
            className="absolute h-[calc(100%-8px)] top-1 rounded-md bg-[var(--bg-elevated)]"
            initial={false}
            animate={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
            }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
          />

          {stages.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStageChange(s.value)}
              className={cn(
                "relative px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap z-10",
                stage === s.value
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search + Sort */}
        <div className="flex gap-2">
          {/* Search */}
          <div className="relative flex-1 lg:w-64">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="7" cy="7" r="5" />
                <path d="M11 11l3 3" strokeLinecap="round" />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search tokens..."
              className="input pl-9 py-2 text-sm"
            />
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value)}
            className="input w-auto py-2 pr-8 text-sm appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5l3 3 3-3' stroke='%236b7280' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 0.75rem center",
            }}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
