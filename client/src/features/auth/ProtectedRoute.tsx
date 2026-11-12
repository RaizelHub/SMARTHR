import { useEffect, useRef, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import Unauthorized from '../../pages/Unauthorized'
import { useAuth } from './authContextStore'
import {
  hasAllPermissions,
  hasAnyPermission,
  type Permission,
} from './permissions'

export interface ProtectedRouteProps {
  children: ReactNode
  requiredPermissions?: readonly Permission[]
  anyOfPermissions?: readonly Permission[]
}

export default function ProtectedRoute({
  children,
  requiredPermissions = [],
  anyOfPermissions,
}: ProtectedRouteProps) {
  const auth = useAuth()
  const location = useLocation()
  const refreshSession = auth.refreshSession
  const statusRef = useRef(auth.status)

  useEffect(() => {
    statusRef.current = auth.status
  }, [auth.status])

  useEffect(() => {
    if (statusRef.current !== 'loading') {
      void refreshSession()
    }
  }, [location.pathname, location.search, refreshSession])

  if (auth.status === 'loading') {
    return (
      <div
        aria-busy="true"
        className="flex min-h-screen items-center justify-center bg-slate-50 px-4"
      >
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600">
          Verifying session and permissions...
        </div>
      </div>
    )
  }

  if (
    auth.status === 'unauthenticated' ||
    auth.status === 'expired' ||
    !auth.currentUser ||
    auth.currentUser.employmentStatus === 'Inactive'
  ) {
    return (
      <Navigate
        to="/"
        replace
        state={{
          from: `${location.pathname}${location.search}`,
          reason: auth.status === 'expired' ? 'expired' : 'unauthenticated',
        }}
      />
    )
  }

  const satisfiesAll =
    requiredPermissions.length === 0 ||
    hasAllPermissions(auth.currentUser, requiredPermissions)
  const satisfiesAny =
    !anyOfPermissions ||
    anyOfPermissions.length === 0 ||
    hasAnyPermission(auth.currentUser, anyOfPermissions)

  if (!satisfiesAll || !satisfiesAny) {
    const missing = requiredPermissions.filter(
      (permission) => !auth.hasPermission(permission),
    )
    const missingSummary =
      missing.length > 0 ? missing : (anyOfPermissions ?? [])

    return (
      <Unauthorized
        attemptedPath={location.pathname}
        missingPermissions={missingSummary}
      />
    )
  }

  return <>{children}</>
}

