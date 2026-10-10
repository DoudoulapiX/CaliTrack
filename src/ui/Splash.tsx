export function Splash({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas"
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 512 512" className="size-20" aria-hidden>
        <rect width="512" height="512" rx="112" fill="#0b0b0f" />
        <g
          transform="translate(256 256) scale(0.86) translate(-256 -294)"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M88 140 H424" stroke="var(--ct-accent)" strokeWidth="30" />
          <path
            d="M196 140 L218 262 H294 L316 140 M256 262 V368 M256 368 L222 448 M256 368 L290 448"
            stroke="#f5f5f7"
            strokeWidth="28"
          />
          <circle cx="256" cy="212" r="30" fill="#f5f5f7" stroke="none" />
        </g>
      </svg>
      <p className="text-[15px] text-ink-3">{label}</p>
    </div>
  )
}
