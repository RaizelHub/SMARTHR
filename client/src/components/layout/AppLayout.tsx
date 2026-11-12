import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/authContextStore'

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
  const auth = useAuth()
  const navigate = useNavigate()
  const user = auth.currentUser

  const canViewEmployees = auth.hasAnyPermission([
    'employees.read_own',
    'employees.read_team',
    'employees.read_all',
  ])
  const canCreateEmployees = auth.hasPermission('employees.create')
  const canViewAttendance = auth.hasAnyPermission([
    'attendance.record_own',
    'attendance.read_own',
    'attendance.read_team',
    'attendance.read_all',
  ])
  const canViewLeave = auth.hasAnyPermission([
    'leave.request',
    'leave.read_own',
    'leave.read_team',
    'leave.read_all',
  ])
  const canViewReports = auth.hasAnyPermission([
    'reports.view_own',
    'reports.view_team',
    'reports.view_all',
  ])
  const canViewPayroll = auth.hasAnyPermission([
    'payroll.view_own',
    'payroll.view',
  ])
  const canManageRoles = auth.hasPermission('roles.manage')

  async function handleSignOut() {
    await auth.signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-6">
            <NavLink
              to={auth.isAuthenticated ? '/dashboard' : '/'}
              className="flex items-center gap-2 rounded text-base font-semibold tracking-tight text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-700 text-xs font-bold text-white">
                HR
              </span>
              <span>Smart HR</span>
            </NavLink>

            {auth.isAuthenticated && user && (
              <nav
                aria-label="Main navigation"
                className="flex flex-wrap items-center gap-1"
              >
                <NavLink to="/dashboard" className={navLinkClass}>
                  Dashboard
                </NavLink>
                {canViewEmployees && (
                  <NavLink to="/employees" end className={navLinkClass}>
                    Employees
                  </NavLink>
                )}
                {canCreateEmployees && (
                  <NavLink to="/employees/new" className={navLinkClass}>
                    Register Employee
                  </NavLink>
                )}
                {canViewAttendance && (
                  <NavLink to="/attendance" className={navLinkClass}>
                    Attendance
                  </NavLink>
                )}
                {canViewLeave && (
                  <NavLink to="/leave" className={navLinkClass}>
                    Leave
                  </NavLink>
                )}
                {canViewReports && (
                  <NavLink to="/reports" className={navLinkClass}>
                    Reports
                  </NavLink>
                )}
                {canViewPayroll && (
                  <NavLink to="/payroll" className={navLinkClass}>
                    Payroll
                  </NavLink>
                )}
                {canManageRoles && (
                  <NavLink to="/roles" className={navLinkClass}>
                    Access Control
                  </NavLink>
                )}
              </nav>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {auth.isDemoMode ? (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                Demo Mode · Local RBAC
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                Laravel API · Sanctum Auth
              </span>
            )}

            {auth.isAuthenticated && user ? (
              <>
                <span
                  data-testid="active-user-badge"
                  className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800"
                >
                  {user.fullName} ({user.employeeId}) · {user.assignedRole}
                </span>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <NavLink
                to="/"
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                Sign In
              </NavLink>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
