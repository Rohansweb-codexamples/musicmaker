"use client"

import { useRef } from "react"

const R = 17
const C = 2 * Math.PI * R

export function Knob({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  format,
  color = "var(--fg)",
  bipolar = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  format?: (v: number) => string
  color?: string
  bipolar?: boolean
}) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const frac = (value - min) / (max - min)
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const angle = -135 + frac * 270

  const arcLen = 0.75 * C
  const fromFrac = bipolar ? Math.min(frac, 0.5) : 0
  const toFrac = bipolar ? Math.max(frac, 0.5) : frac
  const valueLen = (toFrac - fromFrac) * arcLen

  return (
    <div className="flex w-16 flex-col items-center gap-1">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(2))}
        aria-valuetext={format ? format(value) : undefined}
        className="relative size-11 cursor-ns-resize touch-none rounded-full focus-visible:outline-2 focus-visible:outline-audio"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, v: value }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const dv = ((drag.current.y - e.clientY) / 140) * (max - min)
          onChange(clamp(drag.current.v + dv))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onDoubleClick={() => onChange(bipolar ? (min + max) / 2 : max)}
        onKeyDown={(e) => {
          const stepSize = (max - min) / 50
          if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange(clamp(value + stepSize))
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange(clamp(value - stepSize))
        }}
      >
        <svg viewBox="0 0 44 44" className="size-11" aria-hidden="true">
          <circle cx="22" cy="22" r="15" fill="#3a3a40" stroke="#1a1a1c" strokeWidth="1.5" />
          <circle
            cx="22"
            cy="22"
            r={R}
            fill="none"
            stroke="#44444b"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${C}`}
            transform="rotate(135 22 22)"
          />
          <circle
            cx="22"
            cy="22"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.01, valueLen)} ${C}`}
            strokeDashoffset={-fromFrac * arcLen}
            transform="rotate(135 22 22)"
          />
          <line
            x1="22"
            y1="22"
            x2="22"
            y2="10"
            stroke="#f4f4f6"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${angle} 22 22)`}
          />
        </svg>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="font-mono text-[10px] text-fg/80">{format ? format(value) : Math.round(frac * 100)}</span>
    </div>
  )
}
