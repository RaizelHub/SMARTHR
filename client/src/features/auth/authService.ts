import type { Employee } from '../../types/employee'
import {
  employeeService as defaultEmployeeService,
  type EmployeeService,
  type StorageLike,
} from '../employees/services/employeeService'
import { DEMO_ACTING_EMPLOYEE_KEY } from './demoSession'
import { isSessionExpired } from './securityAudit'

/**
 * DEMO-ONLY AUTHENTICATION & SESSION SERVICE
 *
 * Smart HR does not currently have a backend server or identity provider.
 * Demo sessions identify a synthetic or registered employee via localStorage
 * for workflow and RBAC demonstration only. They do NOT issue signed JWTs
 * or HTTP-only cookies and do NOT provide production authentication security.
 */
export const DEMO_AUTH_SESSION_KEY = 'smarthr.demo.session.v1'
export const DEFAULT_DEMO_SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

export interface DemoSession {
  sessionId: string
  employeeId: string
  issuedAtUtc: string
  expiresAtUtc: string
}

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'expired'

export interface AuthSessionState {
  status: Exclude<AuthStatus, 'loading'>
  user: Employee | null
  session: DemoSession | null
}

export type AuthServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_INACTIVE'
  | 'PERSISTENCE_ERROR'

export class AuthServiceError extends Error {
  readonly code: AuthServiceErrorCode
  readonly httpStatus: 401 | 403 | 404 | 500

  constructor(
    code: AuthServiceErrorCode,
    message: string,
    httpStatus?: 401 | 403 | 404 | 500,
  ) {
    super(message)
    this.name = 'AuthServiceError'
    this.code = code
    this.httpStatus =
      httpStatus ??
      (code === 'EMPLOYEE_NOT_FOUND'
        ? 404
        : code === 'PERSISTENCE_ERROR'
          ? 500
          : 401)
  }
}

export interface DemoAuthServiceOptions {
  employeeService?: EmployeeService
  storage?: StorageLike | null
  now?: () => Date
  defaultTtlMs?: number
}

export interface AuthService {
  readonly isDemoMode: boolean
  signIn(
    employeeId: string,
    ttlMs?: number,
  ): Promise<{ user: Employee; session: DemoSession }>
  signOut(): Promise<void>
  getSessionState(): Promise<AuthSessionState>
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

export const authService: AuthService = createDemoAuthService()

