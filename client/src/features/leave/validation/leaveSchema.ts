import { z } from 'zod'
import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import {
  LEAVE_TYPES,
  type LeaveRequest,
  type LeaveRequestStatus,
  type SubmitLeaveRequestInput,
} from '../../../types/leave'
import { getBusinessDateString } from '../../attendance/utils/timeZone'
import {
  isValidCalendarDate,
  normalizeEmployeeId,
} from '../../employees/validation/employeeSchema'

export const LEAVE_FIELD_LIMITS = {
  reasonMax: 500,
  reviewerNoteMax: 500,
  minLeaveDate: '2000-01-01',
  maxFutureDays: 365,
} as const

export interface LeaveConflictPolicy {
  readonly blockingStatuses: readonly LeaveRequestStatus[]
}

export const DEFAULT_LEAVE_CONFLICT_POLICY: LeaveConflictPolicy = {
  blockingStatuses: ['Pending', 'Approved'],
}

export function getMaxAllowedLeaveDate(
  referenceDate: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  const todayInZone = getBusinessDateString(referenceDate.toISOString(), timeZone)
  const [year, month, day] = todayInZone.split('-').map(Number)
  const maxUtc = new Date(
    Date.UTC(year, month - 1, day + LEAVE_FIELD_LIMITS.maxFutureDays),
  )
  const y = maxUtc.getUTCFullYear()
  const m = String(maxUtc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(maxUtc.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function calculateInclusiveCalendarDays(
  startDate: string,
  endDate: string,
): number {
  if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate)) {
    throw new RangeError('Invalid calendar date range')
  }
  if (endDate < startDate) {
    throw new RangeError('End date cannot be earlier than start date')
  }

  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const startMs = Date.UTC(sy, sm - 1, sd)
  const endMs = Date.UTC(ey, em - 1, ed)

  return Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1
}

export function doDateRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && endA >= startB
}

export function createBaseLeaveRequestSchema(referenceDate: Date = new Date()) {
  const maxDate = getMaxAllowedLeaveDate(referenceDate)

  return z
    .object({
      leaveType: z
        .string()
        .trim()
        .min(1, 'Leave type is required')
        .pipe(
          z.enum(LEAVE_TYPES, {
            error: 'Select a valid leave type',
          }),
        ),
      startDate: z
        .string()
        .trim()
        .min(1, 'Start date is required')
        .refine(isValidCalendarDate, 'Enter a valid start date (YYYY-MM-DD)')
        .refine(
          (value) => value >= LEAVE_FIELD_LIMITS.minLeaveDate,
          `Start date cannot be earlier than ${LEAVE_FIELD_LIMITS.minLeaveDate}`,
        )
        .refine(
          (value) => value <= maxDate,
          `Start date cannot be more than ${LEAVE_FIELD_LIMITS.maxFutureDays} days in the future`,
        ),
      endDate: z
        .string()
        .trim()
        .min(1, 'End date is required')
        .refine(isValidCalendarDate, 'Enter a valid end date (YYYY-MM-DD)')
        .refine(
          (value) => value >= LEAVE_FIELD_LIMITS.minLeaveDate,
          `End date cannot be earlier than ${LEAVE_FIELD_LIMITS.minLeaveDate}`,
        )
        .refine(
          (value) => value <= maxDate,
          `End date cannot be more than ${LEAVE_FIELD_LIMITS.maxFutureDays} days in the future`,
        ),
      reason: z
        .string()
        .trim()
        .max(
          LEAVE_FIELD_LIMITS.reasonMax,
          `Reason cannot exceed ${LEAVE_FIELD_LIMITS.reasonMax} characters`,
        ),
    })
    .superRefine((data, ctx) => {
      if (
        isValidCalendarDate(data.startDate) &&
        isValidCalendarDate(data.endDate) &&
        data.endDate < data.startDate
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'End date cannot be earlier than start date',
        })
      }
    })
}

export interface LeaveSchemaOptions {
  employeeId?: string
  existingRequests?: readonly LeaveRequest[]
  conflictPolicy?: LeaveConflictPolicy
  referenceDate?: Date
}

export function findLeaveRequestConflict(
  candidate: Pick<
    SubmitLeaveRequestInput,
    'employeeId' | 'leaveType' | 'startDate' | 'endDate'
  >,
  existingRequests: readonly LeaveRequest[],
  policy: LeaveConflictPolicy = DEFAULT_LEAVE_CONFLICT_POLICY,
): { kind: 'duplicate' | 'overlap'; conflictingRequest: LeaveRequest } | null {
  const targetEmployeeKey = normalizeEmployeeId(candidate.employeeId)

  const activeRequests = existingRequests.filter(
    (request) =>
      normalizeEmployeeId(request.employeeId) === targetEmployeeKey &&
      policy.blockingStatuses.includes(request.status),
  )

  const duplicate = activeRequests.find(
    (request) =>
      request.leaveType === candidate.leaveType &&
      request.startDate === candidate.startDate &&
      request.endDate === candidate.endDate,
  )

  if (duplicate) {
    return { kind: 'duplicate', conflictingRequest: duplicate }
  }

  const overlapping = activeRequests.find((request) =>
    doDateRangesOverlap(
      candidate.startDate,
      candidate.endDate,
      request.startDate,
      request.endDate,
    ),
  )

  if (overlapping) {
    return { kind: 'overlap', conflictingRequest: overlapping }
  }

  return null
}

export function createLeaveRequestFormSchema(options: LeaveSchemaOptions = {}) {
  const {
    employeeId = '',
    existingRequests = [],
    conflictPolicy = DEFAULT_LEAVE_CONFLICT_POLICY,
    referenceDate = new Date(),
  } = options

  return createBaseLeaveRequestSchema(referenceDate).superRefine((data, ctx) => {
    if (!employeeId.trim()) {
      return
    }
    if (
      !isValidCalendarDate(data.startDate) ||
      !isValidCalendarDate(data.endDate) ||
      data.endDate < data.startDate
    ) {
      return
    }

    const conflict = findLeaveRequestConflict(
      {
        employeeId,
        leaveType: data.leaveType,
        startDate: data.startDate,
        endDate: data.endDate,
      },
      existingRequests,
      conflictPolicy,
    )

    if (!conflict) {
      return
    }

    if (conflict.kind === 'duplicate') {
      ctx.addIssue({
        code: 'custom',
        path: ['startDate'],
        message: `Duplicate leave request: an active ${conflict.conflictingRequest.status} ${conflict.conflictingRequest.leaveType} request already exists for ${conflict.conflictingRequest.startDate} to ${conflict.conflictingRequest.endDate}.`,
      })
      return
    }

    ctx.addIssue({
      code: 'custom',
      path: ['startDate'],
      message: `Dates overlap with an existing ${conflict.conflictingRequest.status} request (${conflict.conflictingRequest.startDate} to ${conflict.conflictingRequest.endDate}).`,
    })
  })
}

export type LeaveRequestFormInput = z.input<
  ReturnType<typeof createBaseLeaveRequestSchema>
>
export type LeaveRequestFormOutput = z.output<
  ReturnType<typeof createBaseLeaveRequestSchema>
>

