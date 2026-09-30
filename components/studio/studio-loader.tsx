"use client"

import dynamic from "next/dynamic"

const Studio = dynamic(() => import("./studio").then((m) => m.Studio), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-studio text-sm text-muted">Loading studio…</div>
  ),
})

export function StudioLoader() {
  return <Studio />
}
