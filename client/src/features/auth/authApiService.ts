import type { AxiosInstance } from 'axios'
import type { AssignedRole, Department, Employee, EmploymentStatus } from '../../types/employee'
import {
  API_SESSION_EXPIRES_KEY,
  ApiClientError,
  clearStoredApiSession,
  createApiHttpClient,
  readStoredApiToken,
  writeStoredApiSession,
} from '../api/httpClient'
import {
  AuthServiceError,
  type AuthService,
  type AuthSessionState,
  type DemoSession,
} from './authTypes'
import { isSessionExpired } from './securityAudit'

interface ApiUserPayload {
  id: number
  email: string
  employeeId: string
  fullName: string
  workEmail: string
  department: string
  position: string
  employmentStatus: string
  assignedRole: string
  isMinimumWageEarner?: boolean
  hireDate: string
  createdAt?: string
}

interface LoginResponsePayload {
  token: string
  tokenType: string
  expiresAtUtc: string
  user: ApiUserPayload
}

interface MeResponsePayload {
  user: ApiUserPayload
}

function mapApiUserToEmployee(user: ApiUserPayload): Employee {
  return {
    id: String(user.id),
    employeeId: user.employeeId,
    fullName: user.fullName,
    workEmail: user.workEmail || user.email,
    department: user.department as Department,
    position: user.position,
    employmentStatus: user.employmentStatus as EmploymentStatus,
    hireDate: user.hireDate,
    assignedRole: user.assignedRole as AssignedRole,
    createdAt:
      user.createdAt ??
      (user.hireDate ? `${user.hireDate}T00:00:00.000Z` : ''),
  }
}

function mapApiErrorToAuthError(error: unknown, fallbackMessage: string): AuthServiceError {
  if (error instanceof AuthServiceError) {
    return error
  }
  if (error instanceof ApiClientError) {
    if (error.code === 'EMPLOYEE_INACTIVE') {
      return new AuthServiceError('EMPLOYEE_INACTIVE', error.message, 403)
    }
    if (error.httpStatus === 401 || error.httpStatus === 403) {
      return new AuthServiceError('UNAUTHORIZED', error.message, 401)
    }
    return new AuthServiceError('PERSISTENCE_ERROR', error.message, 500)
  }
  return new AuthServiceError(
    'PERSISTENCE_ERROR',
    error instanceof Error ? error.message : fallbackMessage,
    500,
  )
}

function readStoredExpiresAt(): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null
  }
  return window.sessionStorage.getItem(API_SESSION_EXPIRES_KEY)
}

export interface ApiAuthServiceOptions {
  httpClient?: AxiosInstance
  now?: () => Date
}

export function createApiAuthService(
  options: ApiAuthServiceOptions = {},
): AuthService {
  const client = options.httpClient ?? createApiHttpClient()
  const now = options.now ?? (() => new Date())

  return {
    isDemoMode: false,

    async signIn(): Promise<{ user: Employee; session: DemoSession }> {
      throw new AuthServiceError(
        'UNAUTHORIZED',
        'Password credentials are required when connected to the backend API.',
        401,
      )
    },

    async signInWithCredentials(
      email: string,
      password: string,
    ): Promise<{ user: Employee; session: DemoSession }> {
      const trimmedEmail = email.trim()
      if (!trimmedEmail || !password) {
        throw new AuthServiceError(
          'UNAUTHORIZED',
          'Email and password are required.',
          401,
        )
      }

      try {
        const res = await client.post<LoginResponsePayload>('/auth/login', {
          email: trimmedEmail,
          password,
        })
        const { token, expiresAtUtc, user } = res.data
        writeStoredApiSession(token, expiresAtUtc)

        const employee = mapApiUserToEmployee(user)
        const session: DemoSession = {
          sessionId: 'sanctum-bearer',
          employeeId: employee.employeeId,
          issuedAtUtc: now().toISOString(),
          expiresAtUtc,
        }

        return { user: employee, session }
      } catch (error) {
        clearStoredApiSession()
        throw mapApiErrorToAuthError(error, 'Unable to sign in to Smart HR API.')
      }
    },

    async signOut(): Promise<void> {
      const token = readStoredApiToken()
      try {
        if (token) {
          await client.post('/auth/logout')
        }
      } catch {
        // Always clear local token even if server revoke failed
      } finally {
        clearStoredApiSession()
      }
    },

    async getSessionState(): Promise<AuthSessionState> {
      const token = readStoredApiToken()
      if (!token) {
        return { status: 'unauthenticated', user: null, session: null }
      }

      const storedExpiresAt = readStoredExpiresAt()
      if (storedExpiresAt && isSessionExpired(storedExpiresAt, now())) {
        clearStoredApiSession()
        return { status: 'expired', user: null, session: null }
      }

      try {
        const res = await client.get<MeResponsePayload>('/auth/me')
        const employee = mapApiUserToEmployee(res.data.user)
        const session: DemoSession = {
          sessionId: 'sanctum-bearer',
          employeeId: employee.employeeId,
          issuedAtUtc: now().toISOString(),
          expiresAtUtc:
            storedExpiresAt ??
            new Date(now().getTime() + 8 * 60 * 60 * 1000).toISOString(),
        }
        return {
          status: 'authenticated',
          user: employee,
          session,
        }
      } catch (error) {
        clearStoredApiSession()
        if (error instanceof ApiClientError && error.httpStatus === 401) {
          return { status: 'expired', user: null, session: null }
        }
        return { status: 'unauthenticated', user: null, session: null }
      }
    },
  }
}

