import { createContext, useContext } from 'react'
import type { Employee } from '../../types/employee'
import {
  AuthServiceError,
  type AuthStatus,
  type DemoSession,
} from './authService'
import type { Permission } from './permissions'

export interface AuthActorContext {
  actorEmployeeId: string | null
  sessionExpiresAtUtc: string | null
}

export interface AuthContextValue {
  status: AuthStatus
  currentUser: Employee | null
  session: DemoSession | null
  isAuthenticated: boolean
  isLoading: boolean
  isDemoMode: boolean
  actorContext: AuthActorContext
  signIn: (employeeId: string, ttlMs?: number) => Promise<Employee>
  signInWithCredentials: (email: string, password: string) => Promise<Employee>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
  hasPermission: (permission: Permission) => boolean
  hasAnyPermission: (permissions: readonly Permission[]) => boolean
}

const FAIL_CLOSED_AUTH_CONTEXT: AuthContextValue = {
  status: 'unauthenticated',
  currentUser: null,
  session: null,
  isAuthenticated: false,
  isLoading: false,
  isDemoMode: true,
  actorContext: {
    actorEmployeeId: null,
    sessionExpiresAtUtc: null,
  },
  signIn: async () => {
    throw new AuthServiceError(
      'UNAUTHORIZED',
      'Authentication provider is unavailable.',
      401,
    )
  },
  signInWithCredentials: async () => {
    throw new AuthServiceError(
      'UNAUTHORIZED',
      'Authentication provider is unavailable.',
      401,
    )
  },
  signOut: async () => undefined,
  refreshSession: async () => undefined,
  hasPermission: () => false,
  hasAnyPermission: () => false,
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  return useContext(AuthContext) ?? FAIL_CLOSED_AUTH_CONTEXT
}

