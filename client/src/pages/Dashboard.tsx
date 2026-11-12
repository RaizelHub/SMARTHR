import { Link } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import { useAuth } from '../features/auth/authContextStore'

export default function Dashboard() {
  const auth = useAuth()
  const user = auth.currentUser

  const canCreateEmployees = auth.hasPermission('employees.create')
  const canReadAllEmployees = auth.hasPermission('employees.read_all')
  const canReadTeamEmployees = auth.hasPermission('employees.read_team')
  const canManageRoles = auth.hasPermission('roles.manage')
  const canReviewLeave = auth.hasAnyPermission(['leave.approve', 'leave.reject'])
  const canViewReports = auth.hasAnyPermission([
    'reports.view_own',
    'reports.view_team',
    'reports.view_all',
  ])
  const canViewAllReports = auth.hasPermission('reports.view_all')
  const canViewTeamReports = auth.hasPermission('reports.view_team')
  const canViewOrgPayroll = auth.hasPermission('payroll.view')
  const canViewOwnPayslips = auth.hasPermission('payroll.view_own')

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {user
              ? `Signed in as ${user.fullName} (${user.assignedRole}, ${user.department}). Controls below reflect your granted permissions.`
              : 'Smart HR workspace overview.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Employee Management
              </h2>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Active (Demo)
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {canCreateEmployees
                ? 'Register new employee records and manage the organization directory.'
                : canReadTeamEmployees
                  ? `View employee records scoped to the ${user?.department ?? ''} department.`
                  : 'View your own employee profile stored in demo mode.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {canCreateEmployees && (
                <Link
                  to="/employees/new"
                  className="rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  Register Employee
                </Link>
              )}
              <Link
                to="/employees"
                className={
                  canCreateEmployees
                    ? 'rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600'
                    : 'rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600'
                }
              >
                {canReadAllEmployees
                  ? 'View Directory'
                  : canReadTeamEmployees
                    ? 'View Department Team'
                    : 'View My Profile'}
              </Link>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Attendance Management
              </h2>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Active (Demo)
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Clock in and clock out with duplicate prevention, Asia/Manila time
              display, and role-scoped attendance history.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/attendance"
                className="rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                Open Attendance
              </Link>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Leave Management
              </h2>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Active (Demo)
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {canReviewLeave
                ? 'Submit leave requests and approve or reject team requests within your authorized scope.'
                : 'Submit leave requests with overlap validation and track your request approval status.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/leave"
                className="rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                Open Leave Management
              </Link>
            </div>
          </section>

          {canViewReports && (
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Reports &amp; Analytics
                </h2>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  Phase 5 Active (Demo)
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {canViewAllReports
                  ? 'Inspect organization-wide workforce, attendance, and leave analytics with filtered CSV exports.'
                  : canViewTeamReports
                    ? `Review analytics and CSV exports scoped to the ${user?.department ?? ''} department.`
                    : 'Inspect your personal workforce profile, attendance, and leave summaries.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/reports"
                  className="rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  Open Reports &amp; Analytics
                </Link>
              </div>
            </section>
          )}

          {(canViewOrgPayroll || canViewOwnPayslips) && (
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  {canViewOrgPayroll
                    ? 'Payroll Foundation'
                    : 'My Draft Payslips'}
                </h2>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  Phase 6A Active (Demo)
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {canViewOrgPayroll
                  ? 'Manage effective-dated PHP compensation, payroll periods, draft calculations, and draft payslip previews.'
                  : 'Inspect your personal draft payslips with itemized earnings and deductions.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/payroll"
                  className="rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {canViewOrgPayroll ? 'Open Payroll Foundation' : 'View My Draft Payslips'}
                </Link>
              </div>
            </section>
          )}

          {canManageRoles ? (
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Access Control &amp; Roles
                </h2>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  Phase 4 Active (Demo)
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Assign roles across employees, inspect permission mappings, and
                review security audit events.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/roles"
                  className="rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  Manage Roles
                </Link>
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Pending Platform Modules
                </h2>
                <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  Pending
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                <li>Leave policy &amp; balance ledger — pending HR rules</li>
                <li>Payroll management — not implemented</li>
                <li>Production auth &amp; database backend — not connected</li>
              </ul>
            </section>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
