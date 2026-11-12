import { z } from 'zod'
import {
  ASSIGNED_ROLES,
  DEPARTMENTS,
  EMPLOYMENT_STATUSES,
  type CreateEmployeeInput,
  type Employee,
} from '../../../types/employee'

export const EMPLOYEE_FIELD_LIMITS = {
  employeeIdMin: 3,
  employeeIdMax: 20,
  fullNameMin: 2,
  fullNameMax: 100,
  workEmailMax: 254,
  positionMin: 2,
  positionMax: 80,
  minHireDate: '1950-01-01',
  maxFutureHireDays: 365,
} as const

const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function normalizeEmployeeId(employeeId: string): string {
  return employeeId.trim().toUpperCase()
}

export function normalizeWorkEmail(workEmail: string): string {
  return workEmail.trim().toLowerCase()
}

export function isValidCalendarDate(dateString: string): boolean {
  const match = ISO_DATE_PATTERN.exec(dateString)
  if (!match) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false
  }

  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

export function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getMaxAllowedHireDate(referenceDate: Date = new Date()): string {
  const utcToday = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  )
  const maxDate = new Date(
    utcToday + EMPLOYEE_FIELD_LIMITS.maxFutureHireDays * 24 * 60 * 60 * 1000,
  )
  return formatUtcDate(maxDate)
}

export function createBaseEmployeeSchema(referenceDate: Date = new Date()) {
  const maxHireDate = getMaxAllowedHireDate(referenceDate)

  return z.object({
    employeeId: z
      .string()
      .trim()
      .min(1, 'Employee ID is required')
      .min(
        EMPLOYEE_FIELD_LIMITS.employeeIdMin,
        `Employee ID must be at least ${EMPLOYEE_FIELD_LIMITS.employeeIdMin} characters`,
      )
      .max(
        EMPLOYEE_FIELD_LIMITS.employeeIdMax,
        `Employee ID cannot exceed ${EMPLOYEE_FIELD_LIMITS.employeeIdMax} characters`,
      )
      .regex(
        EMPLOYEE_ID_PATTERN,
        'Employee ID must start with a letter or number and contain only letters, numbers, hyphens, or underscores',
      ),
    fullName: z
      .string()
      .trim()
      .min(1, 'Full name is required')
      .min(
        EMPLOYEE_FIELD_LIMITS.fullNameMin,
        `Full name must be at least ${EMPLOYEE_FIELD_LIMITS.fullNameMin} characters`,
      )
      .max(
        EMPLOYEE_FIELD_LIMITS.fullNameMax,
        `Full name cannot exceed ${EMPLOYEE_FIELD_LIMITS.fullNameMax} characters`,
      ),
    workEmail: z
      .string()
      .trim()
      .min(1, 'Work email is required')
      .max(
        EMPLOYEE_FIELD_LIMITS.workEmailMax,
        `Work email cannot exceed ${EMPLOYEE_FIELD_LIMITS.workEmailMax} characters`,
      )
      .email('Enter a valid work email address')
      .transform(normalizeWorkEmail),
    department: z
      .string()
      .trim()
      .min(1, 'Department is required')
      .pipe(
        z.enum(DEPARTMENTS, {
          error: 'Select a valid department',
        }),
      ),
    position: z
      .string()
      .trim()
      .min(1, 'Position is required')
      .min(
        EMPLOYEE_FIELD_LIMITS.positionMin,
        `Position must be at least ${EMPLOYEE_FIELD_LIMITS.positionMin} characters`,
      )
      .max(
        EMPLOYEE_FIELD_LIMITS.positionMax,
        `Position cannot exceed ${EMPLOYEE_FIELD_LIMITS.positionMax} characters`,
      ),
    employmentStatus: z
      .string()
      .trim()
      .min(1, 'Employment status is required')
      .pipe(
        z.enum(EMPLOYMENT_STATUSES, {
          error: 'Select a valid employment status',
        }),
      ),
    hireDate: z
      .string()
      .trim()
      .min(1, 'Hire date is required')
      .refine(isValidCalendarDate, 'Enter a valid calendar date (YYYY-MM-DD)')
      .refine(
        (value) => value >= EMPLOYEE_FIELD_LIMITS.minHireDate,
        `Hire date cannot be earlier than ${EMPLOYEE_FIELD_LIMITS.minHireDate}`,
      )
      .refine(
        (value) => value <= maxHireDate,
        'Hire date cannot be more than 1 year in the future',
      ),
    assignedRole: z
      .string()
      .trim()
      .min(1, 'Assigned role is required')
      .pipe(
        z.enum(ASSIGNED_ROLES, {
          error: 'Select a valid assigned role',
        }),
      ),
  })
}

export const employeeRegistrationSchema = createBaseEmployeeSchema()

export interface EmployeeSchemaOptions {
  existingEmployees?: readonly Pick<Employee, 'employeeId' | 'workEmail'>[]
  referenceDate?: Date
}

export function createEmployeeRegistrationSchema(
  options: EmployeeSchemaOptions = {},
) {
  const { existingEmployees = [], referenceDate = new Date() } = options
  const baseSchema = createBaseEmployeeSchema(referenceDate)

  return baseSchema.superRefine((data, ctx) => {
    const candidateId = normalizeEmployeeId(data.employeeId)
    const duplicateId = existingEmployees.some(
      (employee) => normalizeEmployeeId(employee.employeeId) === candidateId,
    )

    if (duplicateId) {
      ctx.addIssue({
        code: 'custom',
        path: ['employeeId'],
        message: `Employee ID "${data.employeeId}" is already registered`,
      })
    }

    const candidateEmail = normalizeWorkEmail(data.workEmail)
    const duplicateEmail = existingEmployees.some(
      (employee) => normalizeWorkEmail(employee.workEmail) === candidateEmail,
    )

    if (duplicateEmail) {
      ctx.addIssue({
        code: 'custom',
        path: ['workEmail'],
        message: `Work email "${data.workEmail}" is already assigned to another employee`,
      })
    }
  })
}

export type EmployeeFormInput = z.input<typeof employeeRegistrationSchema>
export type EmployeeFormOutput = z.output<typeof employeeRegistrationSchema> &
  CreateEmployeeInput
