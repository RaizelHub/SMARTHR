import { describe, expect, it } from 'vitest'
import {
  calculateInclusiveCalendarDays,
  createLeaveRequestFormSchema,
  doDateRangesOverlap,
} from '../validation/leaveSchema'
import type { LeaveRequest } from '../../../types/leave'

const REFERENCE_DATE = new Date('2026-11-12T00:00:00.000Z')

function buildExistingRequest(
  overrides?: Partial<LeaveRequest>,
): LeaveRequest {
  return {
    id: 'leave-1',
    employeeId: 'EMP-1001',
    employeeName: 'Jordan Taylor',
    department: 'Engineering',
    leaveType: 'Annual Leave',
    startDate: '2026-11-20',
    endDate: '2026-11-22',
    calendarDays: 3,
    reason: 'Family travel',
    status: 'Pending',
    businessTimezone: 'Asia/Manila',
    submittedAtUtc: '2026-11-12T01:00:00.000Z',
    reviewedByEmployeeId: null,
    reviewedByName: null,
    reviewedByRole: null,
    reviewedAtUtc: null,
    reviewerNote: null,
    cancelledAtUtc: null,
    decisionHistory: [],
    updatedAtUtc: '2026-11-12T01:00:00.000Z',
    ...overrides,
  }
}

describe('leaveSchema validation', () => {
  it('accepts a valid leave request and calculates inclusive calendar days', () => {
    const schema = createLeaveRequestFormSchema({
      employeeId: 'EMP-1001',
      referenceDate: REFERENCE_DATE,
    })

    const result = schema.safeParse({
      leaveType: 'Annual Leave',
      startDate: '2026-11-25',
      endDate: '2026-11-27',
      reason: 'Scheduled break',
    })

    expect(result.success).toBe(true)
    expect(calculateInclusiveCalendarDays('2026-11-25', '2026-11-27')).toBe(3)
    expect(calculateInclusiveCalendarDays('2026-11-25', '2026-11-25')).toBe(1)
  })

  it('rejects missing required fields and unrecognized leave types', () => {
    const schema = createLeaveRequestFormSchema({
      employeeId: 'EMP-1001',
      referenceDate: REFERENCE_DATE,
    })

    const missingResult = schema.safeParse({
      leaveType: '',
      startDate: '',
      endDate: '',
      reason: '',
    })

    expect(missingResult.success).toBe(false)
    if (!missingResult.success) {
      const paths = missingResult.error.issues.map((issue) =>
        String(issue.path[0]),
      )
      expect(paths).toContain('leaveType')
      expect(paths).toContain('startDate')
      expect(paths).toContain('endDate')
    }

    const badTypeResult = schema.safeParse({
      leaveType: 'Sabbatical',
      startDate: '2026-11-25',
      endDate: '2026-11-26',
      reason: '',
    })
    expect(badTypeResult.success).toBe(false)
  })

  it('rejects end dates earlier than start dates and invalid calendar dates', () => {
    const schema = createLeaveRequestFormSchema({
      employeeId: 'EMP-1001',
      referenceDate: REFERENCE_DATE,
    })

    const reversedDates = schema.safeParse({
      leaveType: 'Sick Leave',
      startDate: '2026-11-25',
      endDate: '2026-11-24',
      reason: '',
    })

    expect(reversedDates.success).toBe(false)
    if (!reversedDates.success) {
      expect(
        reversedDates.error.issues.some(
          (issue) =>
            issue.path[0] === 'endDate' &&
            issue.message.includes('cannot be earlier than start date'),
        ),
      ).toBe(true)
    }

    const impossibleDate = schema.safeParse({
      leaveType: 'Sick Leave',
      startDate: '2026-02-30',
      endDate: '2026-03-01',
      reason: '',
    })
    expect(impossibleDate.success).toBe(false)
  })

  it('rejects duplicate and overlapping active requests while ignoring cancelled/rejected ones', () => {
    expect(
      doDateRangesOverlap(
        '2026-11-20',
        '2026-11-22',
        '2026-11-22',
        '2026-11-24',
      ),
    ).toBe(true)

    const schemaWithPending = createLeaveRequestFormSchema({
      employeeId: 'EMP-1001',
      existingRequests: [buildExistingRequest({ status: 'Pending' })],
      referenceDate: REFERENCE_DATE,
    })

    const duplicate = schemaWithPending.safeParse({
      leaveType: 'Annual Leave',
      startDate: '2026-11-20',
      endDate: '2026-11-22',
      reason: '',
    })
    expect(duplicate.success).toBe(false)
    if (!duplicate.success) {
      expect(duplicate.error.issues[0]?.message).toContain(
        'Duplicate leave request',
      )
    }

    const overlapping = schemaWithPending.safeParse({
      leaveType: 'Sick Leave',
      startDate: '2026-11-21',
      endDate: '2026-11-23',
      reason: '',
    })
    expect(overlapping.success).toBe(false)
    if (!overlapping.success) {
      expect(overlapping.error.issues[0]?.message).toContain('Dates overlap')
    }

    const schemaWithCancelledAndRejected = createLeaveRequestFormSchema({
      employeeId: 'EMP-1001',
      existingRequests: [
        buildExistingRequest({ id: 'l-cancel', status: 'Cancelled' }),
        buildExistingRequest({ id: 'l-reject', status: 'Rejected' }),
      ],
      referenceDate: REFERENCE_DATE,
    })
    expect(
      schemaWithCancelledAndRejected.safeParse({
        leaveType: 'Annual Leave',
        startDate: '2026-11-20',
        endDate: '2026-11-22',
        reason: '',
      }).success,
    ).toBe(true)
  })
})

