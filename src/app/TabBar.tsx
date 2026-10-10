import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'
import { useSettings } from './data-context'
import { visibleTabs } from './tabs'

export function TabBar() {
  const settings = useSettings()
  const tabs = visibleTabs(settings)
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 pb-safe backdrop-blur-xl"
    >
      <ul className="mx-auto flex h-[var(--tabbar-height)] max-w-xl items-stretch">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <li key={tab.key} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium',
                    isActive ? 'text-accent-text' : 'text-ink-3',
                  )
                }
              >
                <Icon size={24} strokeWidth={1.9} aria-hidden />
                <span className="leading-none">{tab.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
