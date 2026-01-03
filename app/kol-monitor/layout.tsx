import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Aggregator",
}

export default function AggregatorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}

