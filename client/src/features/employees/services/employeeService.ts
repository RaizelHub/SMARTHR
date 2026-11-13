import {
  ASSIGNED_ROLES,
  DEPARTMENTS,
  EMPLOYMENT_STATUSES,
  type AssignedRole,
  type CreateEmployeeInput,
  type Employee,
  type UpdateEmployeeInput,
} from '../../../types/employee'
import { isBackendApiConfigured } from '../../api/httpClient'
import {
  canAccessEmployeeRecord,
  hasPermission,
} from '../../auth/permissions'
import {
  appendSecurityAuditEvent,
  isSessionExpired,
  readSecurityAuditEvents,
  type SecurityAuditEntry,
} from '../../auth/securityAudit'
import {
  createBaseEmployeeSchema,
  isValidCalendarDate,
  normalizeEmployeeId,
  normalizeWorkEmail,
} from '../validation/employeeSchema'
import { createApiEmployeeService } from './employeeApiService'

/**
 * DEMO-ONLY PERSISTENCE LAYER
 *
 * Smart HR does not currently have a backend server or database connected.
 * Employee records created here are persisted solely in browser localStorage
 * for demonstration. Client-side RBAC checks mirror target server rules but
 * are NOT a substitute for server-side HTTP 401/403 enforcement.
 */
export const DEMO_EMPLOYEES_STORAGE_KEY = 'smarthr.demo.employees.v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface EmployeeActorContext {
  actorEmployeeId: string | null | undefined
  sessionExpiresAtUtc?: string | null
}

export interface DemoSignInProfile {
  employeeId: string
  fullName: string
  department: Employee['department']
  assignedRole: AssignedRole
  employmentStatus: Employee['employmentStatus']
}

export interface UpdateEmployeeRoleInput {
  targetEmployeeId: string
  newRole: AssignedRole
}

export type EmployeeServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_EMPLOYEE_ID'
  | 'DUPLICATE_WORK_EMAIL'
  | 'EMPLOYEE_NOT_FOUND'
  | 'PERSISTENCE_ERROR'

export class EmployeeServiceError extends Error {
  readonly code: EmployeeServiceErrorCode
  readonly httpStatus: 400 | 401 | 403 | 404 | 409 | 500
  readonly fieldErrors?: Partial<Record<keyof CreateEmployeeInput, string>>

  constructor(
    code: EmployeeServiceErrorCode,
    message: string,
    fieldErrors?: Partial<Record<keyof CreateEmployeeInput, string>>,
    httpStatus?: 400 | 401 | 403 | 404 | 409 | 500,
  ) {
    super(message)
    this.name = 'EmployeeServiceError'
    this.code = code
    this.fieldErrors = fieldErrors
    this.httpStatus =
      httpStatus ??
      (code === 'UNAUTHORIZED'
        ? 403
        : code === 'VALIDATION_ERROR'
          ? 400
          : code === 'EMPLOYEE_NOT_FOUND'
            ? 404
            : code === 'PERSISTENCE_ERROR'
              ? 500
              : 409)
  }
}

export const SYNTHETIC_DEMO_EMPLOYEES: readonly Employee[] = [
  {
    id: 'demo-emp-1001',
    employeeId: 'EMP-1001',
    fullName: 'Jordan Taylor',
    workEmail: 'jordan.taylor@smarthr.demo',
    department: 'Engineering',
    position: 'Senior Software Engineer',
    employmentStatus: 'Active',
    hireDate: '2024-03-18',
    assignedRole: 'Employee',
    createdAt: '2024-03-18T09:00:00.000Z',
  },
  {
    id: 'demo-emp-1002',
    employeeId: 'EMP-1002',
    fullName: 'Priya Nair',
    workEmail: 'priya.nair@smarthr.demo',
    department: 'Human Resources',
    position: 'People Operations Specialist',
    employmentStatus: 'Active',
    hireDate: '2023-11-06',
    assignedRole: 'HR Coordinator',
    createdAt: '2023-11-06T09:00:00.000Z',
  },
  {
    id: 'demo-emp-1003',
    employeeId: 'EMP-1003',
    fullName: 'Marcus Chen',
    workEmail: 'marcus.chen@smarthr.demo',
    department: 'Finance',
    position: 'Financial Analyst',
    employmentStatus: 'Probation',
    hireDate: '2026-09-14',
    assignedRole: 'Employee',
    createdAt: '2026-09-14T09:00:00.000Z',
  },
  {
    id: 'demo-emp-1004',
    employeeId: 'EMP-1004',
    fullName: 'Dana Reyes',
    workEmail: 'dana.reyes@smarthr.demo',
    department: 'Engineering',
    position: 'Engineering Manager',
    employmentStatus: 'Active',
    hireDate: '2022-05-10',
    assignedRole: 'Manager',
    createdAt: '2022-05-10T09:00:00.000Z',
  },
  {
    id: 'demo-emp-1005',
    employeeId: 'EMP-1005',
    fullName: 'Alex Rivera',
    workEmail: 'alex.rivera@smarthr.demo',
    department: 'Human Resources',
    position: 'HR Systems Administrator',
    employmentStatus: 'Active',
    hireDate: '2021-08-02',
    assignedRole: 'HR Admin',
    createdAt: '2021-08-02T09:00:00.000Z',
  },
]

export interface EmployeeService {
  readonly isDemoMode: boolean
  listDemoSignInProfiles(): Promise<DemoSignInProfile[]>
  resolveEmployeeForAuth(employeeId: string): Promise<Employee | null>
  listAllDirectoryForServiceInternal(): Promise<Employee[]>
  listEmployees(actor: EmployeeActorContext): Promise<Employee[]>
  createEmployee(
    input: CreateEmployeeInput,
    actor: EmployeeActorContext,
  ): Promise<Employee>
  updateEmployee?(
    input: UpdateEmployeeInput,
    actor: EmployeeActorContext,
  ): Promise<Employee>
  updateEmployeeRole(
    input: UpdateEmployeeRoleInput,
    actor: EmployeeActorContext,
  ): Promise<Employee>
  listSecurityAuditEvents(
    actor: EmployeeActorContext,
  ): Promise<SecurityAuditEntry[]>
  clearEmployees(actor: EmployeeActorContext): Promise<Employee[]>
  resetDemoEmployees(actor: EmployeeActorContext): Promise<Employee[]>
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

function generateRecordId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `emp-${globalThis.crypto.randomUUID()}`
  }
  return `emp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isEmployeeRecord(value: unknown): value is Employee {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.employeeId === 'string' &&
    typeof record.fullName === 'string' &&
    typeof record.workEmail === 'string' &&
    typeof record.department === 'string' &&
    typeof record.position === 'string' &&
    typeof record.employmentStatus === 'string' &&
    typeof record.hireDate === 'string' &&
    typeof record.assignedRole === 'string' &&
    typeof record.createdAt === 'string'
  )
}

function cloneSeedEmployees(): Employee[] {
  return SYNTHETIC_DEMO_EMPLOYEES.map((employee) => ({ ...employee }))
}

export function createDemoEmployeeService(
  customStorage?: StorageLike | null,
  now: () => Date = () => new Date(),
): EmployeeService {
  let fallbackMemoryStore: Employee[] | null = null

  function resolveStorage(): StorageLike | null {
    if (customStorage !== undefined) {
      return customStorage
    }
    return getDefaultStorage()
  }

  function readStoredEmployees(): Employee[] {
    const storage = resolveStorage()

    if (!storage) {
      if (fallbackMemoryStore === null) {
        fallbackMemoryStore = cloneSeedEmployees()
      }
      return fallbackMemoryStore.map((employee) => ({ ...employee }))
    }

    let raw: string | null
    try {
      raw = storage.getItem(DEMO_EMPLOYEES_STORAGE_KEY)
    } catch {
      throw new EmployeeServiceError(
        'PERSISTENCE_ERROR',
        'Unable to read employee records from browser storage.',
      )
    }

    if (raw === null) {
      const seeded = cloneSeedEmployees()
      writeStoredEmployees(seeded)
      return seeded
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || !parsed.every(isEmployeeRecord)) {
        throw new Error('Invalid employee storage format')
      }
      return parsed
    } catch {
      throw new EmployeeServiceError(
        'PERSISTENCE_ERROR',
        'Stored demo employee data is corrupted. Reset demo data to recover.',
      )
    }
  }

  function writeStoredEmployees(employees: Employee[]): void {
    const storage = resolveStorage()

    if (!storage) {
      fallbackMemoryStore = employees.map((employee) => ({ ...employee }))
      return
    }

    try {
      storage.setItem(DEMO_EMPLOYEES_STORAGE_KEY, JSON.stringify(employees))
    } catch {
      throw new EmployeeServiceError(
        'PERSISTENCE_ERROR',
        'Unable to save employee record to browser storage. Check storage availability or quota.',
      )
    }
  }

  function resolveAuthenticatedActor(
    actor: EmployeeActorContext | null | undefined,
  ): { actorEmployee: Employee; allEmployees: Employee[] } {
    const rawActorId = actor?.actorEmployeeId?.trim() ?? ''
    if (!rawActorId) {
      throw new EmployeeServiceError(
        'UNAUTHORIZED',
        'Authentication is required to access employee management.',
        undefined,
        401,
      )
    }

    if (isSessionExpired(actor?.sessionExpiresAtUtc, now())) {
      throw new EmployeeServiceError(
        'UNAUTHORIZED',
        'Your session has expired. Please sign in again.',
        undefined,
        401,
      )
    }

    const allEmployees = readStoredEmployees()
    const actorKey = normalizeEmployeeId(rawActorId)
    const actorPool =
      allEmployees.length > 0 ? allEmployees : SYNTHETIC_DEMO_EMPLOYEES
    const actorEmployee = actorPool.find(
      (employee) => normalizeEmployeeId(employee.employeeId) === actorKey,
    )

    if (!actorEmployee || actorEmployee.employmentStatus === 'Inactive') {
      throw new EmployeeServiceError(
        'UNAUTHORIZED',
        'Current session does not belong to an active employee account.',
        undefined,
        401,
      )
    }

    return { actorEmployee, allEmployees }
  }

  return {
    isDemoMode: true,

    async listDemoSignInProfiles(): Promise<DemoSignInProfile[]> {
      const stored = readStoredEmployees()
      const pool = stored.length > 0 ? stored : SYNTHETIC_DEMO_EMPLOYEES
      return pool.map((employee) => ({
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        department: employee.department,
        assignedRole: employee.assignedRole,
        employmentStatus: employee.employmentStatus,
      }))
    },

    async resolveEmployeeForAuth(employeeId: string): Promise<Employee | null> {
      const targetKey = normalizeEmployeeId(employeeId)
      if (!targetKey) {
        return null
      }
      const stored = readStoredEmployees()
      const pool = stored.length > 0 ? stored : SYNTHETIC_DEMO_EMPLOYEES
      const match = pool.find(
        (employee) => normalizeEmployeeId(employee.employeeId) === targetKey,
      )
      return match ? { ...match } : null
    },

    async listAllDirectoryForServiceInternal(): Promise<Employee[]> {
      return readStoredEmployees()
    },

    async listEmployees(actor: EmployeeActorContext): Promise<Employee[]> {
      const { actorEmployee, allEmployees } = resolveAuthenticatedActor(actor)
      return allEmployees.filter((employee) =>
        canAccessEmployeeRecord(actorEmployee, employee),
      )
    },

    async createEmployee(
      input: CreateEmployeeInput,
      actor: EmployeeActorContext,
    ): Promise<Employee> {
      const { actorEmployee } = resolveAuthenticatedActor(actor)

      if (!hasPermission(actorEmployee, 'employees.create')) {
        throw new EmployeeServiceError(
          'UNAUTHORIZED',
          'You do not have permission to register new employees.',
          undefined,
          403,
        )
      }

      const parsed = createBaseEmployeeSchema().safeParse(input)
      if (!parsed.success) {
        const fieldErrors: Partial<Record<keyof CreateEmployeeInput, string>> = {}
        for (const issue of parsed.error.issues) {
          const field = issue.path[0]
          if (typeof field === 'string' && !(field in fieldErrors)) {
            fieldErrors[field as keyof CreateEmployeeInput] = issue.message
          }
        }
        throw new EmployeeServiceError(
          'VALIDATION_ERROR',
          'Please fix the highlighted employee registration errors before submitting.',
          fieldErrors,
          400,
        )
      }

      if (
        parsed.data.assignedRole === 'HR Admin' &&
        !hasPermission(actorEmployee, 'roles.manage')
      ) {
        throw new EmployeeServiceError(
          'UNAUTHORIZED',
          'Only an HR Admin can assign the HR Admin role during registration.',
          {
            assignedRole:
              'Only an HR Admin can assign the HR Admin role during registration.',
          },
          403,
        )
      }

      const existing = readStoredEmployees()
      const normalizedId = normalizeEmployeeId(parsed.data.employeeId)
      const normalizedEmail = normalizeWorkEmail(parsed.data.workEmail)

      const duplicateId = existing.some(
        (employee) => normalizeEmployeeId(employee.employeeId) === normalizedId,
      )
      if (duplicateId) {
        const message = `Employee ID "${parsed.data.employeeId}" is already registered`
        throw new EmployeeServiceError('DUPLICATE_EMPLOYEE_ID', message, {
          employeeId: message,
        })
      }

      const duplicateEmail = existing.some(
        (employee) => normalizeWorkEmail(employee.workEmail) === normalizedEmail,
      )
      if (duplicateEmail) {
        const message = `Work email "${parsed.data.workEmail}" is already assigned to another employee`
        throw new EmployeeServiceError('DUPLICATE_WORK_EMAIL', message, {
          workEmail: message,
        })
      }

      const created: Employee = {
        id: generateRecordId(),
        employeeId: parsed.data.employeeId,
        fullName: parsed.data.fullName,
        workEmail: normalizedEmail,
        department: parsed.data.department,
        position: parsed.data.position,
        employmentStatus: parsed.data.employmentStatus,
        hireDate: parsed.data.hireDate,
        assignedRole: parsed.data.assignedRole,
        createdAt: now().toISOString(),
      }

      const updated = [created, ...existing]
      writeStoredEmployees(updated)
      return created
    },

    async updateEmployee(
      input: UpdateEmployeeInput,
      actor: EmployeeActorContext,
    ): Promise<Employee> {
      const { actorEmployee, allEmployees } = resolveAuthenticatedActor(actor)

      if (!hasPermission(actorEmployee, 'employees.update')) {
        throw new EmployeeServiceError(
          'UNAUTHORIZED',
          'You do not have permission to update employee records.',
          undefined,
          403,
        )
      }

      const targetKey = normalizeEmployeeId(input.targetEmployeeId)
      const targetIndex = allEmployees.findIndex(
        (employee) => normalizeEmployeeId(employee.employeeId) === targetKey,
      )

      if (targetIndex === -1) {
        throw new EmployeeServiceError(
          'EMPLOYEE_NOT_FOUND',
          `Employee "${input.targetEmployeeId}" was not found.`,
          undefined,
          404,
        )
      }

      const targetEmployee = allEmployees[targetIndex]
      const nextEmail =
        input.workEmail !== undefined
          ? normalizeWorkEmail(input.workEmail)
          : targetEmployee.workEmail

      if (
        input.workEmail !== undefined &&
        allEmployees.some(
          (emp, idx) =>
            idx !== targetIndex && normalizeWorkEmail(emp.workEmail) === nextEmail,
        )
      ) {
        throw new EmployeeServiceError(
          'DUPLICATE_WORK_EMAIL',
          `Work email "${nextEmail}" is already assigned to another employee`,
          { workEmail: `Work email "${nextEmail}" is already assigned to another employee` },
          409,
        )
      }

      if (
        input.department !== undefined &&
        !DEPARTMENTS.includes(input.department)
      ) {
        throw new EmployeeServiceError(
          'VALIDATION_ERROR',
          `Invalid department "${String(input.department)}".`,
          undefined,
          400,
        )
      }

      if (
        input.employmentStatus !== undefined &&
        !EMPLOYMENT_STATUSES.includes(input.employmentStatus)
      ) {
        throw new EmployeeServiceError(
          'VALIDATION_ERROR',
          `Invalid employment status "${String(input.employmentStatus)}".`,
          undefined,
          400,
        )
      }

      if (input.hireDate !== undefined && !isValidCalendarDate(input.hireDate)) {
        throw new EmployeeServiceError(
          'VALIDATION_ERROR',
          'Hire date must be a valid calendar date.',
          undefined,
          400,
        )
      }

      if (
        input.employmentStatus === 'Inactive' &&
        targetEmployee.assignedRole === 'HR Admin'
      ) {
        const remainingAdmins = allEmployees.filter(
          (emp, idx) =>
            idx !== targetIndex &&
            emp.assignedRole === 'HR Admin' &&
            emp.employmentStatus !== 'Inactive',
        )
        if (remainingAdmins.length === 0) {
          throw new EmployeeServiceError(
            'VALIDATION_ERROR',
            'Cannot deactivate the last active HR Admin account.',
            undefined,
            400,
          )
        }
      }

      const updatedEmployee: Employee = {
        ...targetEmployee,
        fullName:
          input.fullName !== undefined
            ? input.fullName.trim()
            : targetEmployee.fullName,
        workEmail: nextEmail,
        department: input.department ?? targetEmployee.department,
        position:
          input.position !== undefined
            ? input.position.trim()
            : targetEmployee.position,
        employmentStatus:
          input.employmentStatus ?? targetEmployee.employmentStatus,
        hireDate: input.hireDate ?? targetEmployee.hireDate,
      }

      writeStoredEmployees(
        allEmployees.map((emp, idx) =>
          idx === targetIndex ? updatedEmployee : emp,
        ),
      )

      return updatedEmployee
    },

    async updateEmployeeRole(
      input: UpdateEmployeeRoleInput,
      actor: EmployeeActorContext,
    ): Promise<Employee> {
      const storage = resolveStorage()
      let actorEmployee: Employee
      let allEmployees: Employee[]

      try {
        const resolved = resolveAuthenticatedActor(actor)
        actorEmployee = resolved.actorEmployee
        allEmployees = resolved.allEmployees
      } catch (error) {
        appendSecurityAuditEvent(
          {
            eventType: 'ROLE_CHANGE_DENIED',
            actorEmployeeId: actor?.actorEmployeeId?.trim() || 'Anonymous',
            actorRole: 'Unauthenticated',
            targetEmployeeId: input.targetEmployeeId,
            summary: 'Unauthenticated or expired session attempted role change',
            timestampUtc: now().toISOString(),
          },
          storage,
        )
        throw error
      }

      if (!hasPermission(actorEmployee, 'roles.manage')) {
        appendSecurityAuditEvent(
          {
            eventType: 'ROLE_CHANGE_DENIED',
            actorEmployeeId: actorEmployee.employeeId,
            actorRole: actorEmployee.assignedRole,
            targetEmployeeId: input.targetEmployeeId,
            summary: `Denied attempt to assign role "${input.newRole}"`,
            timestampUtc: now().toISOString(),
          },
          storage,
        )
        throw new EmployeeServiceError(
          'UNAUTHORIZED',
          'Only an HR Admin can change employee roles.',
          undefined,
          403,
        )
      }

      if (!ASSIGNED_ROLES.includes(input.newRole)) {
        throw new EmployeeServiceError(
          'VALIDATION_ERROR',
          `Invalid role "${String(input.newRole)}" specified.`,
          undefined,
          400,
        )
      }

      const targetKey = normalizeEmployeeId(input.targetEmployeeId)
      const targetIndex = allEmployees.findIndex(
        (employee) => normalizeEmployeeId(employee.employeeId) === targetKey,
      )

      if (targetIndex === -1) {
        throw new EmployeeServiceError(
          'EMPLOYEE_NOT_FOUND',
          `Employee "${input.targetEmployeeId}" was not found.`,
          undefined,
          404,
        )
      }

      const targetEmployee = allEmployees[targetIndex]

      if (
        targetEmployee.assignedRole === 'HR Admin' &&
        input.newRole !== 'HR Admin'
      ) {
        const remainingActiveAdmins = allEmployees.filter(
          (employee) =>
            employee.assignedRole === 'HR Admin' &&
            employee.employmentStatus !== 'Inactive' &&
            normalizeEmployeeId(employee.employeeId) !== targetKey,
        )

        if (remainingActiveAdmins.length === 0) {
          throw new EmployeeServiceError(
            'VALIDATION_ERROR',
            'Cannot remove HR Admin privileges from the last active administrator.',
            undefined,
            400,
          )
        }
      }

      const updatedEmployee: Employee = {
        ...targetEmployee,
        assignedRole: input.newRole,
      }

      writeStoredEmployees(
        allEmployees.map((employee, idx) =>
          idx === targetIndex ? updatedEmployee : employee,
        ),
      )

      appendSecurityAuditEvent(
        {
          eventType: 'ROLE_CHANGED',
          actorEmployeeId: actorEmployee.employeeId,
          actorRole: actorEmployee.assignedRole,
          targetEmployeeId: updatedEmployee.employeeId,
          summary: `Updated role from ${targetEmployee.assignedRole} to ${input.newRole}`,
          timestampUtc: now().toISOString(),
        },
        storage,
      )

      return updatedEmployee
    },

    async listSecurityAuditEvents(
      actor: EmployeeActorContext,
    ): Promise<SecurityAuditEntry[]> {
      const { actorEmployee } = resolveAuthenticatedActor(actor)
      if (!hasPermission(actorEmployee, 'roles.manage')) {
        throw new EmployeeServiceError(
          'UNAUTHORIZED',
          'Only an HR Admin can inspect the security audit log.',
          undefined,
          403,
        )
      }
      return readSecurityAuditEvents(resolveStorage())
    },

    async clearEmployees(actor: EmployeeActorContext): Promise<Employee[]> {
      const { actorEmployee } = resolveAuthenticatedActor(actor)
      if (!hasPermission(actorEmployee, 'employees.delete')) {
        throw new EmployeeServiceError(
          'UNAUTHORIZED',
          'Only an HR Admin can clear demo employee records.',
          undefined,
          403,
        )
      }
      writeStoredEmployees([])
      appendSecurityAuditEvent(
        {
          eventType: 'DIRECTORY_CLEARED',
          actorEmployeeId: actorEmployee.employeeId,
          actorRole: actorEmployee.assignedRole,
          targetEmployeeId: null,
          summary: 'Cleared demo employee directory',
          timestampUtc: now().toISOString(),
        },
        resolveStorage(),
      )
      return []
    },

    async resetDemoEmployees(actor: EmployeeActorContext): Promise<Employee[]> {
      const { actorEmployee } = resolveAuthenticatedActor(actor)
      if (!hasPermission(actorEmployee, 'employees.delete')) {
        throw new EmployeeServiceError(
          'UNAUTHORIZED',
          'Only an HR Admin can reset demo employee records.',
          undefined,
          403,
        )
      }
      const seeded = cloneSeedEmployees()
      writeStoredEmployees(seeded)
      appendSecurityAuditEvent(
        {
          eventType: 'DIRECTORY_RESET',
          actorEmployeeId: actorEmployee.employeeId,
          actorRole: actorEmployee.assignedRole,
          targetEmployeeId: null,
          summary: 'Reset demo employee directory to synthetic defaults',
          timestampUtc: now().toISOString(),
        },
        resolveStorage(),
      )
      return seeded
    },
  }
}

export const employeeService: EmployeeService = isBackendApiConfigured()
  ? createApiEmployeeService()
  : createDemoEmployeeService()
