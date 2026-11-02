import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { APP_ICON, APP_ICON_BG, appIconArc } from '@/lib/app-icon'
import { cssAnimations } from '@/lib/motion'

/** Arrondi des coins, comme celui des icônes d'iOS. */
const RADIUS = 112
const STRAP_TOP = -10

/**
 * L'icône de l'appli dessinée en SVG (la même que sur l'écran d'accueil). Avec `animate`, l'anneau se remplit
 * (`.app-icon-fill` dans index.css) et prévient au début et à la fin de l'animation.
 */
export function AppIconMark({
  className,
  animate = false,
  onFillStart,
  onFillEnd,
}: {
  className?: string
  animate?: boolean
  onFillStart?: () => void
  onFillEnd?: () => void
}) {
  // Les identifiants de React contiennent des signes que `url(#…)` n'accepte pas tels quels.
  const id = `app-icon-${useId().replace(/[^\w-]/g, '')}`
  const fillRef = useRef<SVGCircleElement>(null)
  const callbacks = useRef({ onFillStart, onFillEnd })
  useEffect(() => {
    callbacks.current = { onFillStart, onFillEnd }
  })

  // Le navigateur crée l'animation au premier calcul des styles : on la prend tout de suite, sans attendre
  // `animationstart`, que WebKit n'envoie qu'au rendu suivant, parfois après le chargement des données (l'appli
  // s'ouvrait alors en coupant l'anneau). Les événements restent écoutés là où getAnimations manque (tests).
  // Écouteurs natifs : React ne suit `animationstart` que sous un nom préfixé là où AnimationEvent manque.
  useLayoutEffect(() => {
    const fill = fillRef.current
    if (!fill || !animate) return
    let active = true
    const start = () => {
      if (active) callbacks.current.onFillStart?.()
    }
    const end = () => {
      if (active) callbacks.current.onFillEnd?.()
    }
    fill.addEventListener('animationstart', start)
    fill.addEventListener('animationend', end)
    const [animation] = cssAnimations(fill, 'app-icon-fill')
    if (animation) {
      start()
      // Rejetée si l'animation est annulée (écran de chargement retiré) : rien à faire.
      animation.finished.then(end, () => undefined)
    }
    return () => {
      active = false
      fill.removeEventListener('animationstart', start)
      fill.removeEventListener('animationend', end)
    }
  }, [animate])
  const { size, ring, fill, strap } = APP_ICON
  const { circumference, filled, rotate } = appIconArc()
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="30%" r="80%">
          <stop offset="0" stopColor={APP_ICON.glow} />
          <stop offset="1" stopColor={APP_ICON_BG} />
        </radialGradient>
        <linearGradient
          id={`${id}-fill`}
          gradientUnits="userSpaceOnUse"
          x1={fill.x1}
          y1={fill.y1}
          x2={fill.x2}
          y2={fill.y2}
        >
          <stop offset="0" stopColor={fill.from} />
          <stop offset="1" stopColor={fill.to} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <rect width={size} height={size} rx={RADIUS} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width={size} height={size} fill={`url(#${id}-bg)`} />
        <circle
          cx={ring.cx}
          cy={ring.cy}
          r={ring.r}
          fill="none"
          stroke={APP_ICON.track}
          strokeWidth={ring.width}
        />
        <circle
          ref={fillRef}
          data-testid="app-icon-fill"
          className={animate ? 'app-icon-fill' : undefined}
          cx={ring.cx}
          cy={ring.cy}
          r={ring.r}
          fill="none"
          stroke={`url(#${id}-fill)`}
          strokeWidth={ring.width}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(${rotate} ${ring.cx} ${ring.cy})`}
        />
        <rect
          x={size / 2 - strap.width / 2}
          y={STRAP_TOP}
          width={strap.width}
          height={strap.bottom - STRAP_TOP}
          rx={strap.radius}
          fill={APP_ICON.cream}
        />
        {APP_ICON.buckles.map((buckle) => (
          <rect key={buckle.y} {...buckle} fill={APP_ICON.cream} />
        ))}
      </g>
    </svg>
  )
}
