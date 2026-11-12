import { Link } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'

export default function Dashboard() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Smart HR workspace overview. Employee registration, attendance, and
            leave management are active in demo mode; remaining modules are
            unimplemented.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Employee Management
              </h2>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Phase 1 Active (Demo)
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Register new employee records with validation and view registered
              employees stored locally in your browser.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/employees/new"
                className="rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                Register Employee
              </Link>
              <Link
                to="/employees"
                className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                View Directory
              </Link>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Attendance Management
              </h2>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Phase 2 Active (Demo)
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Clock in and clock out with duplicate prevention, Asia/Manila time
              display, and persistent session history.
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
                Phase 3 Active (Demo)
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Submit leave requests with overlap validation, cancel pending
              requests, and approve or reject within role permissions.
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

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Upcoming Modules
              </h2>
              <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                Pending
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              <li>Leave policy &amp; balance ledger — pending HR rules</li>
              <li>Payroll management — not implemented</li>
              <li>Authentication &amp; RBAC backend — not implemented</li>
            </ul>
          </section>
        </div>
      </div>
    </AppLayout>
  )
}
