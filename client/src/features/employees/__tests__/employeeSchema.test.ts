import { describe, expect, it } from 'vitest'
import {
  createEmployeeRegistrationSchema,
  EMPLOYEE_FIELD_LIMITS,
  isValidCalendarDate,
} from '../validation/employeeSchema'
import { SYNTHETIC_DEMO_EMPLOYEES } from '../services/employeeService'

const REFERENCE_DATE = new Date('2026-11-12T00:00:00.000Z')

function buildValidInput() {
  return {
    employeeId: 'EMP-2001',
    fullName: 'Morgan Ellis',
    workEmail: 'Morgan.Ellis@smarthr.demo',
    department: 'Engineering',
    position: 'Software Engineer',
    employmentStatus: 'Active',
    hireDate: '2026-10-15',
    assignedRole: 'Employee',
  }
}

describe('employeeSchema validation', () => {
  it('accepts valid employee registration input and normalizes email', () => {
    const schema = createEmployeeRegistrationSchema({
      existingEmployees: SYNTHETIC_DEMO_EMPLOYEES,
      referenceDate: REFERENCE_DATE,
    })

    const result = schema.safeParse(buildValidInput())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.employeeId).toBe('EMP-2001')
      expect(result.data.workEmail).toBe('morgan.ellis@smarthr.demo')
      expect(result.data.department).toBe('Engineering')
      expect(result.data.employmentStatus).toBe('Active')
      expect(result.data.assignedRole).toBe('Employee')
    }
  })

  it('rejects missing required fields', () => {
    const schema = createEmployeeRegistrationSchema({
      referenceDate: REFERENCE_DATE,
    })

    const result = schema.safeParse({
      employeeId: '   ',
      fullName: '',
      workEmail: '',
      department: '',
      position: '',
      employmentStatus: '',
      hireDate: '',
      assignedRole: '',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((issue) => String(issue.path[0]))
      expect(paths).toContain('employeeId')
      expect(paths).toContain('fullName')
      expect(paths).toContain('workEmail')
      expect(paths).toContain('department')
      expect(paths).toContain('position')
      expect(paths).toContain('employmentStatus')
      expect(paths).toContain('hireDate')
      expect(paths).toContain('assignedRole')
    }
  })

  it('rejects invalid work email addresses', () => {
    const schema = createEmployeeRegistrationSchema({
      referenceDate: REFERENCE_DATE,
    })

    for (const badEmail of ['not-an-email', 'missing@domain', '@smarthr.demo']) {
      const result = schema.safeParse({
        ...buildValidInput(),
        workEmail: badEmail,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(
          result.error.issues.some((issue) => issue.path[0] === 'workEmail'),
        ).toBe(true)
      }
    }
  })

  it('rejects duplicate employee IDs and work emails case-insensitively', () => {
    const schema = createEmployeeRegistrationSchema({
      existingEmployees: SYNTHETIC_DEMO_EMPLOYEES,
      referenceDate: REFERENCE_DATE,
    })

    const result = schema.safeParse({
      ...buildValidInput(),
      employeeId: 'emp-1001',
      workEmail: 'JORDAN.TAYLOR@SMARTHR.DEMO',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const idIssue = result.error.issues.find(
        (issue) => issue.path[0] === 'employeeId',
      )
      const emailIssue = result.error.issues.find(
        (issue) => issue.path[0] === 'workEmail',
      )
      expect(idIssue?.message).toContain('already registered')
      expect(emailIssue?.message).toContain('already assigned')
    }
  })

  it('validates calendar dates and hire date bounds', () => {
    expect(isValidCalendarDate('2026-02-28')).toBe(true)
    expect(isValidCalendarDate('2026-02-30')).toBe(false)
    expect(isValidCalendarDate('2025-02-29')).toBe(false)
    expect(isValidCalendarDate('2024-02-29')).toBe(true)

    const schema = createEmployeeRegistrationSchema({
      referenceDate: REFERENCE_DATE,
    })

    const impossibleDate = schema.safeParse({
      ...buildValidInput(),
      hireDate: '2026-02-30',
    })
    expect(impossibleDate.success).toBe(false)

    const tooOldDate = schema.safeParse({
      ...buildValidInput(),
      hireDate: '1940-01-01',
    })
    expect(tooOldDate.success).toBe(false)

    const farFutureDate = schema.safeParse({
      ...buildValidInput(),
      hireDate: '2028-01-01',
    })
    expect(farFutureDate.success).toBe(false)
  })

  it('enforces maximum input lengths and valid domain values', () => {
    const schema = createEmployeeRegistrationSchema({
      referenceDate: REFERENCE_DATE,
    })

    const overMaxResult = schema.safeParse({
      ...buildValidInput(),
      employeeId: 'E'.repeat(EMPLOYEE_FIELD_LIMITS.employeeIdMax + 1),
      fullName: 'A'.repeat(EMPLOYEE_FIELD_LIMITS.fullNameMax + 1),
      position: 'P'.repeat(EMPLOYEE_FIELD_LIMITS.positionMax + 1),
      employmentStatus: 'Terminated',
    })

    expect(overMaxResult.success).toBe(false)
    if (!overMaxResult.success) {
      const paths = overMaxResult.error.issues.map((issue) =>
        String(issue.path[0]),
      )
      expect(paths).toContain('employeeId')
      expect(paths).toContain('fullName')
      expect(paths).toContain('position')
      expect(paths).toContain('employmentStatus')
    }
  })
})

