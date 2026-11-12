import type { Employee } from '../../types/employee'
import { isBackendApiConfigured } from '../api/httpClient'
import {
  employeeService as defaultEmployeeService,
  type EmployeeService,
  type StorageLike,
} from '../employees/services/employeeService'
import { createApiAuthService } from './authApiService'
import {
  AuthServiceError,
  type AuthService,
  type AuthServiceErrorCode,
  type AuthSessionState,
  type AuthStatus,
  type DemoSession,
} from './authTypes'
import { DEMO_ACTING_EMPLOYEE_KEY } from './demoSession'
import { isSessionExpired } from './securityAudit'

export {
  AuthServiceError,
  type AuthService,
  type AuthServiceErrorCode,
  type AuthSessionState,
  type AuthStatus,
  type DemoSession,
}

/**
 * AUTHENTICATION & SESSION SERVICE
 *
 * When VITE_API_BASE_URL is configured, connects to Laravel Sanctum API auth.
 * Otherwise falls back cleanly to Demo-Only localStorage authentication so
 * isolated Phases 1-6A frontend demos and automated suites continue working.
 */
export const DEMO_AUTH_SESSION_KEY = 'smarthr.demo.session.v1'
export const DEFAULT_DEMO_SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

export interface DemoAuthServiceOptions {
  employeeService?: EmployeeService
  storage?: StorageLike | null
  now?: () => Date
  defaultTtlMs?: number
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

function generateSessionId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `sess-${globalThis.crypto.randomUUID()}`
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isDemoSession(value: unknown): value is DemoSession {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const session = value as Record<string, unknown>
  return (
    typeof session.sessionId === 'string' &&
    session.sessionId.trim().length > 0 &&
    typeof session.employeeId === 'string' &&
    session.employeeId.trim().length > 0 &&
    typeof session.issuedAtUtc === 'string' &&
    typeof session.expiresAtUtc === 'string'
  )
}

export function createDemoAuthService(
  options: DemoAuthServiceOptions = {},
): AuthService {
  const empService = options.employeeService ?? defaultEmployeeService
  const now = options.now ?? (() => new Date())
  const defaultTtlMs = options.defaultTtlMs ?? DEFAULT_DEMO_SESSION_TTL_MS
  let memorySession: DemoSession | null = null

  function resolveStorage(): StorageLike | null {
    if (options.storage !== undefined) {
      return options.storage
    }
    return getDefaultStorage()
  }

  function clearStoredSession(): void {
    memorySession = null
    const storage = resolveStorage()
    if (!storage) {
      return
    }
    try {
      storage.removeItem(DEMO_AUTH_SESSION_KEY)
      storage.removeItem(DEMO_ACTING_EMPLOYEE_KEY)
    } catch {
      // Best-effort cleanup
    }
  }

  function writeStoredSession(session: DemoSession): void {
    const storage = resolveStorage()
    if (!storage) {
      memorySession = { ...session }
      return
    }
    try {
      storage.setItem(DEMO_AUTH_SESSION_KEY, JSON.stringify(session))
    } catch {
      throw new AuthServiceError(
        'PERSISTENCE_ERROR',
        'Unable to store demo session in browser storage.',
        500,
      )
    }
  }

  function readStoredSession(): DemoSession | null {
    const storage = resolveStorage()
    if (!storage) {
      return memorySession ? { ...memorySession } : null
    }

    let raw: string | null
    try {
      raw = storage.getItem(DEMO_AUTH_SESSION_KEY)
    } catch {
      return null
    }

    if (!raw) {
      return null
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isDemoSession(parsed)) {
        clearStoredSession()
        return null
      }
      return parsed
    } catch {
      clearStoredSession()
      return null
    }
  }

  return {
    isDemoMode: true,

    async signIn(
      employeeId: string,
      ttlMs: number = defaultTtlMs,
    ): Promise<{ user: Employee; session: DemoSession }> {
      const trimmedId = employeeId.trim()
      if (!trimmedId) {
        throw new AuthServiceError(
          'UNAUTHORIZED',
          'Select an employee account to sign in.',
          401,
        )
      }

      const employee = await empService.resolveEmployeeForAuth(trimmedId)
      if (!employee) {
        throw new AuthServiceError(
          'EMPLOYEE_NOT_FOUND',
          `Employee "${trimmedId}" was not found.`,
          404,
        )
      }

      if (employee.employmentStatus === 'Inactive') {
        throw new AuthServiceError(
          'EMPLOYEE_INACTIVE',
          'Inactive employee accounts cannot sign in.',
          401,
        )
      }

      const currentNow = now()
      const issuedAtUtc = currentNow.toISOString()
      const expiresAtUtc = new Date(currentNow.getTime() + ttlMs).toISOString()

      const session: DemoSession = {
        sessionId: generateSessionId(),
        employeeId: employee.employeeId,
        issuedAtUtc,
        expiresAtUtc,
      }

      writeStoredSession(session)
      return { user: employee, session }
    },

    async signOut(): Promise<void> {
      clearStoredSession()
    },

    async getSessionState(): Promise<AuthSessionState> {
      const stored = readStoredSession()
      if (!stored) {
        return { status: 'unauthenticated', user: null, session: null }
      }

      if (isSessionExpired(stored.expiresAtUtc, now())) {
        clearStoredSession()
        return { status: 'expired', user: null, session: null }
      }

      const resolvedUser = await empService.resolveEmployeeForAuth(
        stored.employeeId,
      )
      if (!resolvedUser || resolvedUser.employmentStatus === 'Inactive') {
        clearStoredSession()
        return { status: 'unauthenticated', user: null, session: null }
      }

      return {
        status: 'authenticated',
        user: resolvedUser,
        session: stored,
      }
    },
  }
}

export const authService: AuthService = isBackendApiConfigured()
  ? createApiAuthService()
  : createDemoAuthService()

