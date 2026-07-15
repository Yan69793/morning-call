import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/',         icon: '⬡', label: 'Radar' },
  { to: '/strategy', icon: '◈', label: 'Estratégia' },
  { to: '/operator', icon: '◉', label: 'Operador' },
  { to: '/history',  icon: '◷', label: 'Histórico' },
  { to: '/signals',  icon: '⚡', label: 'Sinais' },
]

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-50 w-12 h-12 bg-accent-blue text-white rounded-full shadow-lg flex items-center justify-center"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-16 lg:w-16 bg-sidebar dark:bg-slate-900 flex flex-col items-center py-5 gap-1 shrink-0 transition-transform ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="text-white font-semibold text-xs tracking-widest mb-6 select-none">RQB</div>
        {NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={label}
            onClick={() => setIsOpen(false)}
            className={({ isActive }) =>
              `w-10 h-10 flex items-center justify-center rounded-lg text-base transition-all ` +
              (isActive
                ? 'bg-accent-blue text-white shadow-sm'
                : 'text-sidebar-text hover:text-white hover:bg-sidebar-active dark:hover:bg-slate-800')
            }
          >
            {icon}
          </NavLink>
        ))}
      </aside>
    </>
  )
}
