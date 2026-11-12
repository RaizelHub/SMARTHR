import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Employee } from '../../types/employee'
import { AuthContext, type AuthContextValue } from './authContextStore'
import {
  authService as defaultAuthService,
  AuthServiceError,
  type AuthService,
  type AuthStatus,
  type DemoSession,
} from './authService'
import {
  hasAnyPermission as checkHasAnyPermission,
  hasPermission as checkHasPermission,
  type Permission,
} from './permissions'

export interface InitialAuthState {
  status: Exclude<AuthStatus, 'loading'>
  user: Employee | null
  session?: DemoSession | null
}

export interface AuthProviderProps {
  children: ReactNode
  authService?: AuthService
  initialAuthState?: InitialAuthState
}

interface InternalAuthState {
  status: AuthStatus
  user: Employee | null
  session: DemoSession | null
}

const MAX_TIMEOUT_MS = 2_147_483_647

export function AuthProvider({
  children,
  authService = defaultAuthService,
  initialAuthState,
}: AuthProviderProps) {
  const [state, setState] = useState<InternalAuthState>(() => {
    if (initialAuthState) {
      return {
        status: initialAuthState.status,
        user: initialAuthState.user,
        session: initialAuthState.session ?? null,
      }
    }
    return {
      status: 'loading',
      user: null,
      session: null,
    }
  })

  useEffect(() => {
    if (initialAuthState) {
      return
    }

    let cancelled = false

    authService
      .getSessionState()
      .then((resolved) => {
        if (!cancelled) {
          setState({
            status: resolved.status,
            user: resolved.user,
            session: resolved.session,
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: 'unauthenticated',
            user: null,
            session: null,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [authService, initialAuthState])

  useEffect(() => {
    if (initialAuthState || state.status !== 'authenticated' || !state.session) {
      return
    }

    const expiresMs = Date.parse(state.session.expiresAtUtc)
    if (Number.isNaN(expiresMs)) {
      return
    }

    const remainingMs = Math.min(Math.max(expiresMs - Date.now(), 0), MAX_TIMEOUT_MS)
    const timerId = window.setTimeout(() => {
      void authService
        .getSessionState()
        .then((resolved) => {
          setState({
            status: resolved.status,
            user: resolved.user,
            session: resolved.session,
          })
        })
        .catch(() => {
          setState({
            status: 'unauthenticated',
            user: null,
            session: null,
          })
        })
    }, remainingMs)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [authService, initialAuthState, state.session, state.status])

  const signIn = useCallback(
    async (employeeId: string, ttlMs?: number): Promise<Employee> => {
      const result = await authService.signIn(employeeId, ttlMs)
      setState({
        status: 'authenticated',
        user: result.user,
        session: result.session,
      })
      return result.user
    },
    [authService],
  )

  const signInWithCredentials = useCallback(
    async (email: string, password: string): Promise<Employee> => {
      if (!authService.signInWithCredentials) {
        throw new AuthServiceError(
          'UNAUTHORIZED',
          'Email/password authentication is only enabled when connected to the backend API.',
          401,
        )
      }
      const result = await authService.signInWithCredentials(email, password)
      setState({
        status: 'authenticated',
        user: result.user,
        session: result.session,
      })
      return result.user
    },
    [authService],
  )

  const signOut = useCallback(async (): Promise<void> => {
    await authService.signOut()
    setState({
      status: 'unauthenticated',
      user: null,
      session: null,
    })
  }, [authService])

  const refreshSession = useCallback(async (): Promise<void> => {
    if (initialAuthState) {
      return
    }
    try {
      const resolved = await authService.getSessionState()
      setState({
        status: resolved.status,
        user: resolved.user,
        session: resolved.session,
      })
    } catch {
      setState({
        status: 'unauthenticated',
        user: null,
        session: null,
      })
    }
  }, [authService, initialAuthState])

  const activeUser =
    state.status === 'authenticated' &&
    state.user &&
    state.user.employmentStatus !== 'Inactive'
      ? state.user
      : null

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      currentUser: activeUser,
      session: activeUser ? state.session : null,
      isAuthenticated: Boolean(activeUser),
      isLoading: state.status === 'loading',
      isDemoMode: authService.isDemoMode,
      actorContext: {
        actorEmployeeId: activeUser ? activeUser.employeeId : null,
        sessionExpiresAtUtc:
          activeUser && state.session ? state.session.expiresAtUtc : null,
      },
      signIn,
      signInWithCredentials,
      signOut,
      refreshSession,
      hasPermission: (permission: Permission) =>
        checkHasPermission(activeUser, permission),
      hasAnyPermission: (permissions: readonly Permission[]) =>
        checkHasAnyPermission(activeUser, permissions),
    }),
    [
      activeUser,
      authService.isDemoMode,
      refreshSession,
      signIn,
      signInWithCredentials,
      signOut,
      state.session,
      state.status,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

