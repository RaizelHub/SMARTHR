import type { Employee } from '../../types/employee'

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

export interface AuthService {
  readonly isDemoMode: boolean
  signIn(
    employeeId: string,
    ttlMs?: number,
  ): Promise<{ user: Employee; session: DemoSession }>
  signInWithCredentials?(
    email: string,
    password: string,
  ): Promise<{ user: Employee; session: DemoSession }>
  signOut(): Promise<void>
  getSessionState(): Promise<AuthSessionState>
}

