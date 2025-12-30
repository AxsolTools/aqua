"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface TokenChartProps {
  tokenId: string
}

const timeframes = [
  { value: "1H", label: "1H" },
  { value: "4H", label: "4H" },
  { value: "1D", label: "1D" },
  { value: "1W", label: "1W" },
  { value: "ALL", label: "All" },
]

interface PricePoint {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export function TokenChart({ tokenId }: TokenChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const [timeframe, setTimeframe] = useState("1D")
  const [priceData, setPriceData] = useState<PricePoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [priceChange, setPriceChange] = useState<number>(0)

  // Fetch price data
  useEffect(() => {
    const fetchPriceHistory = async () => {
      setIsLoading(true)
      const supabase = createClient()

      const { data } = await supabase
        .from("price_history")
        .select("*")
        .eq("token_id", tokenId)
        .order("timestamp", { ascending: true })
        .limit(500)

      if (data && data.length > 0) {
        setPriceData(data as PricePoint[])
        const lastPrice = data[data.length - 1].close
        const firstPrice = data[0].open
        setCurrentPrice(lastPrice)
        setPriceChange(((lastPrice - firstPrice) / firstPrice) * 100)
      }
      setIsLoading(false)
    }

    fetchPriceHistory()

    // Real-time subscription
    const supabase = createClient()
    const channel = supabase
      .channel(`price-${tokenId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "price_history", filter: `token_id=eq.${tokenId}` },
        (payload) => {
          const newPoint = payload.new as PricePoint
          setPriceData((prev) => [...prev, newPoint].slice(-500))
          setCurrentPrice(newPoint.close)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tokenId, timeframe])

  // Initialize TradingView Lightweight Charts
  useEffect(() => {
    if (!chartContainerRef.current || priceData.length === 0) return

    const initChart = async () => {
      const { createChart, ColorType, CrosshairMode } = await import("lightweight-charts")

      if (chartRef.current) {
        chartRef.current.remove()
      }

      const chart = createChart(chartContainerRef.current!, {
        width: chartContainerRef.current!.clientWidth,
        height: 400,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "rgba(244, 244, 245, 0.6)",
          fontFamily: "'Inter', sans-serif",
        },
        grid: {
          vertLines: { color: "rgba(255, 255, 255, 0.03)" },
          horzLines: { color: "rgba(255, 255, 255, 0.03)" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: "rgba(20, 184, 166, 0.4)",
            width: 1,
            style: 2,
            labelBackgroundColor: "#14b8a6",
          },
          horzLine: {
            color: "rgba(20, 184, 166, 0.4)",
            width: 1,
            style: 2,
            labelBackgroundColor: "#14b8a6",
          },
        },
        rightPriceScale: {
          borderColor: "rgba(255, 255, 255, 0.06)",
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor: "rgba(255, 255, 255, 0.06)",
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: { vertTouchDrag: false },
      })

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      })

      const chartData = priceData.map((point) => ({
        time: Math.floor(new Date(point.timestamp).getTime() / 1000) as any,
        open: Number(point.open),
        high: Number(point.high),
        low: Number(point.low),
        close: Number(point.close),
      }))

      candlestickSeries.setData(chartData)

      const volumeSeries = chart.addHistogramSeries({
        color: "rgba(20, 184, 166, 0.3)",
        priceFormat: { type: "volume" },
        priceScaleId: "",
      })

      chart.priceScale("").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      })

      const volumeData = priceData.map((point) => ({
        time: Math.floor(new Date(point.timestamp).getTime() / 1000) as any,
        value: Number(point.volume),
        color: Number(point.close) >= Number(point.open) ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)",
      }))

      volumeSeries.setData(volumeData)

      chart.timeScale().fitContent()

      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth })
        }
      }

      window.addEventListener("resize", handleResize)
      chartRef.current = chart

      return () => {
        window.removeEventListener("resize", handleResize)
        chart.remove()
      }
    }

    initChart()
  }, [priceData])

  const formatPrice = (price: number): string => {
    if (price < 0.0001) return price.toExponential(2)
    if (price < 0.01) return price.toFixed(6)
    if (price < 1) return price.toFixed(4)
    return price.toFixed(2)
  }

  return (
    <div className="glass-panel-elevated p-0 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Trading Chart</h3>
          {currentPrice !== null && (
            <div className="flex items-center gap-3">
              <span className="text-xl font-semibold text-[var(--text-primary)]">${formatPrice(currentPrice)}</span>
              <span
                className={cn(
                  "text-sm font-semibold px-2 py-1 rounded",
                  priceChange >= 0
                    ? "text-[var(--green)] bg-[var(--green-bg)]"
                    : "text-[var(--red)] bg-[var(--red-bg)]",
                )}
              >
                {priceChange >= 0 ? "+" : ""}
                {priceChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
          {timeframes.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={cn(
                "px-3 py-1.5 rounded text-xs font-semibold transition-all",
                timeframe === tf.value
                  ? "bg-[var(--aqua-primary)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div ref={chartContainerRef} className="relative h-[400px]">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-secondary)]/50 z-10">
            <div className="w-8 h-8 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-sm text-[var(--text-muted)]">Loading chart...</p>
          </div>
        )}
        {!isLoading && priceData.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-secondary)]/30">
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              className="mb-3 opacity-40 text-[var(--aqua-primary)]"
              stroke="currentColor"
            >
              <path d="M8 28l8-8 8 4 12-16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm text-[var(--text-muted)]">No price data yet</p>
            <p className="text-xs text-[var(--text-dim)] mt-1">Chart will appear when trading starts</p>
          </div>
        )}
      </div>
    </div>
  )
}
