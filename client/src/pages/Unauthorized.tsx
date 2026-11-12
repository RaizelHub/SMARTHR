import { Link, useLocation } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import { useAuth } from '../features/auth/authContextStore'
import type { Permission } from '../features/auth/permissions'

interface UnauthorizedProps {
  attemptedPath?: string
  missingPermissions?: readonly Permission[]
}

export default function Unauthorized({
  attemptedPath,
  missingPermissions = [],
}: UnauthorizedProps) {
  const auth = useAuth()
  const location = useLocation()
  const resolvedPath = attemptedPath ?? location.pathname

  return (
    <AppLayout>
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6">
        <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800">
          HTTP 403 · Access Denied
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Unauthorized Access
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Your current role (
          <span className="font-medium text-slate-900">
            {auth.currentUser?.assignedRole ?? 'Unauthenticated'}
          </span>
          ) does not have permission to view or perform actions on{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
            {resolvedPath}
          </code>
          .
        </p>

        {missingPermissions.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Required permission(s):{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-700">
              {missingPermissions.join(', ')}
            </code>
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {auth.isAuthenticated ? (
            <Link
              to="/dashboard"
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              Return to Dashboard
            </Link>
          ) : (
            <Link
              to="/"
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              Go to Sign In
            </Link>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

