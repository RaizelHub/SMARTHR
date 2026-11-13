import type { AxiosInstance } from 'axios'
import type {
  CreateEmployeeInput,
  Employee,
  UpdateEmployeeInput,
} from '../../../types/employee'
import { ApiClientError, createApiHttpClient } from '../../api/httpClient'
import type { SecurityAuditEntry } from '../../auth/securityAudit'
import {
  EmployeeServiceError,
  type DemoSignInProfile,
  type EmployeeService,
  type EmployeeServiceErrorCode,
  type UpdateEmployeeRoleInput,
} from './employeeService'

export interface ApiEmployeeServiceOptions {
  httpClient?: AxiosInstance
}

function mapErrorCode(code: string, status: number): EmployeeServiceErrorCode {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'VALIDATION_ERROR':
    case 'DUPLICATE_EMPLOYEE_ID':
    case 'DUPLICATE_WORK_EMAIL':
    case 'EMPLOYEE_NOT_FOUND':
    case 'PERSISTENCE_ERROR':
      return code
    default:
      if (status === 401 || status === 403) return 'UNAUTHORIZED'
      if (status === 404) return 'EMPLOYEE_NOT_FOUND'
      if (status === 422 || status === 400) return 'VALIDATION_ERROR'
      return 'PERSISTENCE_ERROR'
  }
}

function mapHttpStatus(status: number): 400 | 401 | 403 | 404 | 409 | 500 {
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409
  ) {
    return status
  }
  if (status === 422) {
    return 400
  }
  return 500
}

function rethrowAsEmployeeError(error: unknown, fallback: string): never {
  if (error instanceof EmployeeServiceError) {
    throw error
  }
  if (error instanceof ApiClientError) {
    throw new EmployeeServiceError(
      mapErrorCode(error.code, error.httpStatus),
      error.message,
      error.fieldErrors as Partial<Record<keyof CreateEmployeeInput, string>> | undefined,
      mapHttpStatus(error.httpStatus),
    )
  }
  throw new EmployeeServiceError(
    'PERSISTENCE_ERROR',
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : fallback,
    undefined,
    500,
  )
}

export function createApiEmployeeService(
  options: ApiEmployeeServiceOptions = {},
): EmployeeService {
  const client = options.httpClient ?? createApiHttpClient()

  return {
    isDemoMode: false,

    async listDemoSignInProfiles(): Promise<DemoSignInProfile[]> {
      return []
    },

    async resolveEmployeeForAuth(employeeId: string): Promise<Employee | null> {
      try {
        const res = await client.get<{ employees: Employee[] }>('/employees/scoped')
        return (
          res.data.employees.find(
            (emp) => emp.employeeId.toUpperCase() === employeeId.trim().toUpperCase(),
          ) ?? null
        )
      } catch {
        return null
      }
    },

    async listAllDirectoryForServiceInternal(): Promise<Employee[]> {
      try {
        const res = await client.get<{ employees: Employee[] }>('/employees/scoped')
        return res.data.employees
      } catch (error) {
        rethrowAsEmployeeError(error, 'Failed to fetch employee directory.')
      }
    },

    async listEmployees(): Promise<Employee[]> {
      try {
        const res = await client.get<{ employees: Employee[] }>('/employees/scoped')
        return res.data.employees
      } catch (error) {
        rethrowAsEmployeeError(error, 'Failed to load employee records.')
      }
    },

    async createEmployee(input: CreateEmployeeInput): Promise<Employee> {
      try {
        const res = await client.post<{ employee: Employee }>('/employees', input)
        return res.data.employee
      } catch (error) {
        rethrowAsEmployeeError(error, 'Unable to register employee record.')
      }
    },

    async updateEmployee(input: UpdateEmployeeInput): Promise<Employee> {
      try {
        const { targetEmployeeId, ...payload } = input
        const res = await client.patch<{ employee: Employee }>(
          `/employees/${encodeURIComponent(targetEmployeeId)}`,
          payload,
        )
        return res.data.employee
      } catch (error) {
        rethrowAsEmployeeError(error, 'Unable to update employee record.')
      }
    },

    async updateEmployeeRole(input: UpdateEmployeeRoleInput): Promise<Employee> {
      try {
        const res = await client.patch<{ employee: Employee }>(
          `/employees/${encodeURIComponent(input.targetEmployeeId)}/role`,
          { newRole: input.newRole },
        )
        return res.data.employee
      } catch (error) {
        rethrowAsEmployeeError(error, 'Unable to update employee role assignment.')
      }
    },

    async listSecurityAuditEvents(): Promise<SecurityAuditEntry[]> {
      try {
        const res = await client.get<{ auditEvents: SecurityAuditEntry[] }>(
          '/security-audit-logs',
        )
        return res.data.auditEvents
      } catch (error) {
        rethrowAsEmployeeError(error, 'Unable to load security audit events.')
      }
    },

    async clearEmployees(): Promise<Employee[]> {
      throw new EmployeeServiceError(
        'UNAUTHORIZED',
        'Clearing employee records is disabled when connected to the Laravel API.',
        undefined,
        403,
      )
    },

    async resetDemoEmployees(): Promise<Employee[]> {
      throw new EmployeeServiceError(
        'UNAUTHORIZED',
        'Resetting demo data is unavailable when connected to the Laravel API.',
        undefined,
        403,
      )
    },
  }
}

