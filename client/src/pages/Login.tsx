import { Link } from 'react-router-dom'

export default function Login() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6">
        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
          Authentication Pending · Demo Mode
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Login Page
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Backend authentication and role-based access control are not yet
          implemented. Continue to the demo workspace to test Employee
          Registration, Attendance, and Leave Management.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/employees"
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Open Employee Management
          </Link>
          <Link
            to="/attendance"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Open Attendance
          </Link>
          <Link
            to="/leave"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Open Leave Management
          </Link>
          <Link
            to="/dashboard"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
