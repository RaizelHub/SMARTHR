import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/authContextStore'
import {
  employeeService as defaultEmployeeService,
  type DemoSignInProfile,
  type EmployeeService,
} from '../features/employees/services/employeeService'

interface LoginPageProps {
  empService?: EmployeeService
}

interface LoginLocationState {
  from?: string
  reason?: 'unauthenticated' | 'expired'
}

function getSafeRedirectTarget(from: unknown): string {
  if (
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    from !== '/'
  ) {
    return from
  }
  return '/dashboard'
}

export default function Login({
  empService = defaultEmployeeService,
}: LoginPageProps) {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const locationState = (location.state as LoginLocationState | null) ?? null

  const [profiles, setProfiles] = useState<DemoSignInProfile[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [isLoadingProfiles, setIsLoadingProfiles] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    empService
      .listDemoSignInProfiles()
      .then((loaded) => {
        if (!cancelled) {
          setProfiles(loaded)
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'Unable to load demo employee accounts.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProfiles(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [empService])

  async function handleSignInSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError(null)

    if (!selectedEmployeeId) {
      setAuthError('Select a demo employee account before signing in.')
      return
    }

    setIsSubmitting(true)
    try {
      await auth.signIn(selectedEmployeeId)
      const destination = getSafeRedirectTarget(locationState?.from)
      navigate(destination, { replace: true })
    } catch (error: unknown) {
      setAuthError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Unable to sign in with the selected account.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6">
        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
          Demo Authentication · Frontend-Only RBAC
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          Sign In to Smart HR
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Select a demo account to evaluate Role-Based Access Control across
          Employee Management, Attendance, Leave Requests, and Role
          Administration. Production deployments require backend authentication
          and server-verified sessions.
        </p>

        {locationState?.reason === 'expired' && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900"
          >
            Your previous demo session expired. Sign in again to continue.
          </div>
        )}

        {locationState?.reason === 'unauthenticated' && locationState.from && (
          <div
            role="note"
            className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700"
          >
            Authentication is required to access{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 text-slate-900">
              {locationState.from}
            </code>
            .
          </div>
        )}

        {auth.isAuthenticated && auth.currentUser ? (
          <div className="mt-5 space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                Active Demo Session
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {auth.currentUser.fullName} ({auth.currentUser.employeeId})
              </p>
              <p className="text-xs text-slate-700">
                Role: {auth.currentUser.assignedRole} · Department:{' '}
                {auth.currentUser.department}
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Link
                to="/dashboard"
                className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                Continue to Dashboard
              </Link>
              <button
                type="button"
                onClick={() => void auth.signOut()}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSignInSubmit(e)} noValidate className="mt-5 space-y-4">
            {loadError && (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
              >
                {loadError}
              </div>
            )}

            {authError && (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
              >
                {authError}
              </div>
            )}

            <div>
              <label
                htmlFor="demo-account-select"
                className="block text-sm font-medium text-slate-700"
              >
                Demo Account
              </label>
              <select
                id="demo-account-select"
                value={selectedEmployeeId}
                disabled={isLoadingProfiles || isSubmitting}
                onChange={(event) => {
                  setSelectedEmployeeId(event.target.value)
                  setAuthError(null)
                }}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">
                  {isLoadingProfiles
                    ? 'Loading demo accounts...'
                    : 'Select a demo employee account'}
                </option>
                {profiles.map((profile) => (
                  <option key={profile.employeeId} value={profile.employeeId}>
                    {profile.employeeId} — {profile.fullName} (
                    {profile.assignedRole} · {profile.department} ·{' '}
                    {profile.employmentStatus})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={isLoadingProfiles || isSubmitting}
              className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1"
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
