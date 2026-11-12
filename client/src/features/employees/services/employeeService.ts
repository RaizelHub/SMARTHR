import type { CreateEmployeeInput, Employee } from '../../../types/employee'
import {
  createBaseEmployeeSchema,
  normalizeEmployeeId,
  normalizeWorkEmail,
} from '../validation/employeeSchema'

/**
 * DEMO-ONLY PERSISTENCE LAYER
 *
 * Smart HR does not currently have a backend server or database connected.
 * Employee records created here are persisted solely in browser localStorage
 * for demonstration and Phase 1 workflow verification.
 */
export const DEMO_EMPLOYEES_STORAGE_KEY = 'smarthr.demo.employees.v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type EmployeeServiceErrorCode =
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_EMPLOYEE_ID'
  | 'DUPLICATE_WORK_EMAIL'
  | 'PERSISTENCE_ERROR'

export class EmployeeServiceError extends Error {
  readonly code: EmployeeServiceErrorCode
  readonly fieldErrors?: Partial<Record<keyof CreateEmployeeInput, string>>

  constructor(
    code: EmployeeServiceErrorCode,
    message: string,
    fieldErrors?: Partial<Record<keyof CreateEmployeeInput, string>>,
  ) {
    super(message)
    this.name = 'EmployeeServiceError'
    this.code = code
    this.fieldErrors = fieldErrors
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
]

export interface EmployeeService {
  readonly isDemoMode: boolean
  listEmployees(): Promise<Employee[]>
  createEmployee(input: CreateEmployeeInput): Promise<Employee>
  clearEmployees(): Promise<Employee[]>
  resetDemoEmployees(): Promise<Employee[]>
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

  return {
    isDemoMode: true,

    async listEmployees(): Promise<Employee[]> {
      return readStoredEmployees()
    },

    async createEmployee(input: CreateEmployeeInput): Promise<Employee> {
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
        createdAt: new Date().toISOString(),
      }

      const updated = [created, ...existing]
      writeStoredEmployees(updated)
      return created
    },

    async clearEmployees(): Promise<Employee[]> {
      writeStoredEmployees([])
      return []
    },

    async resetDemoEmployees(): Promise<Employee[]> {
      const seeded = cloneSeedEmployees()
      writeStoredEmployees(seeded)
      return seeded
    },
  }
}

export const employeeService: EmployeeService = createDemoEmployeeService()

