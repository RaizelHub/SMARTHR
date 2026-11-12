import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

interface AppLayoutProps {
  children: ReactNode
}

function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base =
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1'
  return isActive
    ? `${base} bg-blue-50 text-blue-800 border border-blue-200`
    : `${base} text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent`
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <NavLink
              to="/dashboard"
              className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-700 text-xs font-bold text-white">
                HR
              </span>
              <span>Smart HR</span>
            </NavLink>

            <nav aria-label="Main navigation" className="flex items-center gap-1">
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/employees" end className={navLinkClass}>
                Employees
              </NavLink>
              <NavLink to="/employees/new" className={navLinkClass}>
                Register Employee
              </NavLink>
              <NavLink to="/attendance" className={navLinkClass}>
                Attendance
              </NavLink>
              <NavLink to="/leave" className={navLinkClass}>
                Leave
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              Demo Mode · Local Storage Only
            </span>
            <NavLink
              to="/"
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              Exit to Login
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}

