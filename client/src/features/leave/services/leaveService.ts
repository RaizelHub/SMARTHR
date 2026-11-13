import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import type { Employee } from '../../../types/employee'
import type {
  LeaveActorContext,
  LeaveRequest,
  ReviewLeaveRequestInput,
  SubmitLeaveRequestInput,
} from '../../../types/leave'
import { isBackendApiConfigured } from '../../api/httpClient'
import {
  canApproveOrRejectLeave,
  canViewLeaveRecord,
  getPermissionsForRole,
  hasAnyPermission,
  hasPermission,
} from '../../auth/permissions'
import { isSessionExpired } from '../../auth/securityAudit'
import {
  employeeService as defaultEmployeeService,
  type EmployeeService,
  type StorageLike,
} from '../../employees/services/employeeService'
import { normalizeEmployeeId } from '../../employees/validation/employeeSchema'
import {
  calculateInclusiveCalendarDays,
  createBaseLeaveRequestSchema,
  DEFAULT_LEAVE_CONFLICT_POLICY,
  findLeaveRequestConflict,
  LEAVE_FIELD_LIMITS,
  type LeaveConflictPolicy,
} from '../validation/leaveSchema'
import { createApiLeaveService } from './leaveApiService'

/**
 * DEMO-ONLY LEAVE PERSISTENCE LAYER
 *
 * Smart HR does not currently have a backend server, database, or configured
 * leave balance/accrual policy. Leave requests and approval decisions are
 * stored in browser localStorage for Phase 3 workflow verification.
 */
export const DEMO_LEAVE_STORAGE_KEY = 'smarthr.demo.leaveRequests.v1'

export type LeaveServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_INACTIVE'
  | 'REQUEST_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_LEAVE_REQUEST'
  | 'OVERLAPPING_LEAVE_REQUEST'
  | 'INVALID_STATUS_TRANSITION'
  | 'PERSISTENCE_ERROR'

export class LeaveServiceError extends Error {
  readonly code: LeaveServiceErrorCode
  readonly httpStatus: 400 | 401 | 403 | 404 | 409 | 500
  readonly fieldErrors?: Partial<Record<keyof SubmitLeaveRequestInput, string>>

  constructor(
    code: LeaveServiceErrorCode,
    message: string,
    fieldErrors?: Partial<Record<keyof SubmitLeaveRequestInput, string>>,
    httpStatus?: 400 | 401 | 403 | 404 | 409 | 500,
  ) {
    super(message)
    this.name = 'LeaveServiceError'
    this.code = code
    this.fieldErrors = fieldErrors
    this.httpStatus =
      httpStatus ??
      (code === 'UNAUTHORIZED' || code === 'EMPLOYEE_INACTIVE'
        ? 403
        : code === 'EMPLOYEE_NOT_FOUND' || code === 'REQUEST_NOT_FOUND'
          ? 404
          : code === 'VALIDATION_ERROR'
            ? 400
            : code === 'PERSISTENCE_ERROR'
              ? 500
              : 409)
  }
}

export interface DemoLeaveServiceOptions {
  employeeService?: EmployeeService
  storage?: StorageLike | null
  now?: () => Date
  conflictPolicy?: LeaveConflictPolicy
}

export interface LeaveService {
  readonly isDemoMode: boolean
  readonly businessTimezone: string
  readonly balanceTrackingSupported: boolean
  listLeaveRequests(actor: LeaveActorContext): Promise<LeaveRequest[]>
  submitLeaveRequest(
    input: SubmitLeaveRequestInput,
    actor: LeaveActorContext,
  ): Promise<LeaveRequest>
  cancelLeaveRequest(
    requestId: string,
    actor: LeaveActorContext,
    note?: string,
  ): Promise<LeaveRequest>
  reviewLeaveRequest(
    input: ReviewLeaveRequestInput,
    actor: LeaveActorContext,
  ): Promise<LeaveRequest>
  clearLeaveRequests(actor: LeaveActorContext): Promise<LeaveRequest[]>
}

export function isReviewerRole(role: Employee['assignedRole']): boolean {
  const perms = getPermissionsForRole(role)
  return perms.includes('leave.approve') || perms.includes('leave.reject')
}

export function canReviewerActOnRequest(
  reviewer: Employee,
  request: LeaveRequest,
): { allowed: boolean; reason?: string } {
  return canApproveOrRejectLeave(reviewer, request)
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

function generateLeaveRequestId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `leave-${globalThis.crypto.randomUUID()}`
  }
  return `leave-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isLeaveDecisionEntry(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const entry = value as Record<string, unknown>
  return (
    typeof entry.action === 'string' &&
    typeof entry.actorEmployeeId === 'string' &&
    typeof entry.actorName === 'string' &&
    typeof entry.actorRole === 'string' &&
    typeof entry.timestampUtc === 'string' &&
    (entry.note === null || typeof entry.note === 'string')
  )
}

function isLeaveRequestRecord(value: unknown): value is LeaveRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.employeeId === 'string' &&
    typeof record.employeeName === 'string' &&
    typeof record.department === 'string' &&
    typeof record.leaveType === 'string' &&
    typeof record.startDate === 'string' &&
    typeof record.endDate === 'string' &&
    typeof record.calendarDays === 'number' &&
    typeof record.reason === 'string' &&
    typeof record.status === 'string' &&
    typeof record.businessTimezone === 'string' &&
    typeof record.submittedAtUtc === 'string' &&
    Array.isArray(record.decisionHistory) &&
    record.decisionHistory.every(isLeaveDecisionEntry) &&
    typeof record.updatedAtUtc === 'string'
  )
}

export function createDemoLeaveService(
  options: DemoLeaveServiceOptions = {},
): LeaveService {
  const empService = options.employeeService ?? defaultEmployeeService
  const now = options.now ?? (() => new Date())
  const conflictPolicy =
    options.conflictPolicy ?? DEFAULT_LEAVE_CONFLICT_POLICY
  let fallbackMemoryStore: LeaveRequest[] = []
  const locks = new Map<string, Promise<unknown>>()

  function resolveStorage(): StorageLike | null {
    if (options.storage !== undefined) {
      return options.storage
    }
    return getDefaultStorage()
  }

  async function withLock<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve()
    const current = previous.then(
      () => operation(),
      () => operation(),
    )
    const tail = current.then(
      () => undefined,
      () => undefined,
    )
    locks.set(key, tail)

    try {
      return await current
    } finally {
      if (locks.get(key) === tail) {
        locks.delete(key)
      }
    }
  }

  function readStoredRequests(): LeaveRequest[] {
    const storage = resolveStorage()
    if (!storage) {
      return fallbackMemoryStore.map((item) => ({
        ...item,
        decisionHistory: [...item.decisionHistory],
      }))
    }

    let raw: string | null
    try {
      raw = storage.getItem(DEMO_LEAVE_STORAGE_KEY)
    } catch {
      throw new LeaveServiceError(
        'PERSISTENCE_ERROR',
        'Unable to read leave requests from browser storage.',
      )
    }

    if (raw === null) {
      return []
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || !parsed.every(isLeaveRequestRecord)) {
        throw new Error('Invalid leave request storage format')
      }
      return parsed
    } catch {
      throw new LeaveServiceError(
        'PERSISTENCE_ERROR',
        'Stored demo leave data is corrupted. Clear demo leave records to recover.',
      )
    }
  }

  function writeStoredRequests(requests: LeaveRequest[]): void {
    const storage = resolveStorage()
    if (!storage) {
      fallbackMemoryStore = requests.map((item) => ({
        ...item,
        decisionHistory: [...item.decisionHistory],
      }))
      return
    }

    try {
      storage.setItem(DEMO_LEAVE_STORAGE_KEY, JSON.stringify(requests))
    } catch {
      throw new LeaveServiceError(
        'PERSISTENCE_ERROR',
        'Unable to save leave request to browser storage. Check storage availability or quota.',
      )
    }
  }

  async function resolveActor(
    actor: LeaveActorContext,
  ): Promise<{ actorEmployee: Employee; allEmployees: Employee[] }> {
    const rawActorId = actor.actorEmployeeId?.trim() ?? ''
    if (!rawActorId) {
      throw new LeaveServiceError(
        'UNAUTHORIZED',
        'An authenticated employee session is required to access leave management.',
        undefined,
        401,
      )
    }

    if (isSessionExpired(actor.sessionExpiresAtUtc, now())) {
      throw new LeaveServiceError(
        'UNAUTHORIZED',
        'Your session has expired. Please sign in again.',
        undefined,
        401,
      )
    }

    const allEmployees = await empService.listAllDirectoryForServiceInternal()
    const actorKey = normalizeEmployeeId(rawActorId)
    const actorEmployee = allEmployees.find(
      (employee) => normalizeEmployeeId(employee.employeeId) === actorKey,
    )

    if (!actorEmployee) {
      throw new LeaveServiceError(
        'UNAUTHORIZED',
        'Current session identity does not match an existing employee record.',
        undefined,
        401,
      )
    }

    if (actorEmployee.employmentStatus === 'Inactive') {
      throw new LeaveServiceError(
        'EMPLOYEE_INACTIVE',
        'Inactive employees cannot perform leave management actions.',
        undefined,
        403,
      )
    }

    return { actorEmployee, allEmployees }
  }

  function sortNewestFirst(requests: LeaveRequest[]): LeaveRequest[] {
    return [...requests].sort(
      (a, b) => Date.parse(b.submittedAtUtc) - Date.parse(a.submittedAtUtc),
    )
  }

  return {
    isDemoMode: true,
    businessTimezone: BUSINESS_TIMEZONE,
    balanceTrackingSupported: false,

    async listLeaveRequests(
      actor: LeaveActorContext,
    ): Promise<LeaveRequest[]> {
      const { actorEmployee } = await resolveActor(actor)
      if (
        !hasAnyPermission(actorEmployee, [
          'leave.read_own',
          'leave.read_team',
          'leave.read_all',
        ])
      ) {
        throw new LeaveServiceError(
          'UNAUTHORIZED',
          'You do not have permission to view leave requests.',
          undefined,
          403,
        )
      }
      const requests = readStoredRequests()
      return sortNewestFirst(
        requests.filter((request) => canViewLeaveRecord(actorEmployee, request)),
      )
    },

    async submitLeaveRequest(
      input: SubmitLeaveRequestInput,
      actor: LeaveActorContext,
    ): Promise<LeaveRequest> {
      const lockKey = `submit:${normalizeEmployeeId(input.employeeId ?? '') || '__empty__'}`
      return withLock(lockKey, async () => {
        const { actorEmployee, allEmployees } = await resolveActor(actor)

        if (!hasPermission(actorEmployee, 'leave.request')) {
          throw new LeaveServiceError(
            'UNAUTHORIZED',
            'Your role does not have permission to submit leave requests.',
            undefined,
            403,
          )
        }

        const trimmedTargetId = (input.employeeId ?? '').trim()
        if (!trimmedTargetId) {
          throw new LeaveServiceError(
            'EMPLOYEE_NOT_FOUND',
            'Employee ID is required to submit a leave request.',
          )
        }

        const targetKey = normalizeEmployeeId(trimmedTargetId)
        const targetEmployee = allEmployees.find(
          (employee) => normalizeEmployeeId(employee.employeeId) === targetKey,
        )

        if (!targetEmployee) {
          throw new LeaveServiceError(
            'EMPLOYEE_NOT_FOUND',
            `Employee record "${trimmedTargetId}" was not found.`,
          )
        }

        if (
          normalizeEmployeeId(actorEmployee.employeeId) !==
          normalizeEmployeeId(targetEmployee.employeeId)
        ) {
          throw new LeaveServiceError(
            'UNAUTHORIZED',
            'You are not authorized to submit a leave request for another employee.',
          )
        }

        if (targetEmployee.employmentStatus === 'Inactive') {
          throw new LeaveServiceError(
            'EMPLOYEE_INACTIVE',
            'Inactive employees cannot submit new leave requests.',
          )
        }

        const referenceNow = now()
        const parsed = createBaseLeaveRequestSchema(referenceNow).safeParse({
          leaveType: input.leaveType,
          startDate: input.startDate,
          endDate: input.endDate,
          reason: input.reason ?? '',
        })

        if (!parsed.success) {
          const fieldErrors: Partial<
            Record<keyof SubmitLeaveRequestInput, string>
          > = {}
          for (const issue of parsed.error.issues) {
            const field = issue.path[0]
            if (typeof field === 'string' && !(field in fieldErrors)) {
              fieldErrors[field as keyof SubmitLeaveRequestInput] =
                issue.message
            }
          }
          throw new LeaveServiceError(
            'VALIDATION_ERROR',
            'Please fix the highlighted leave request validation errors.',
            fieldErrors,
          )
        }

        const existing = readStoredRequests()
        const conflict = findLeaveRequestConflict(
          {
            employeeId: targetEmployee.employeeId,
            leaveType: parsed.data.leaveType,
            startDate: parsed.data.startDate,
            endDate: parsed.data.endDate,
          },
          existing,
          conflictPolicy,
        )

        if (conflict?.kind === 'duplicate') {
          const message = `Duplicate leave request: an active ${conflict.conflictingRequest.status} ${conflict.conflictingRequest.leaveType} request already exists for ${conflict.conflictingRequest.startDate} to ${conflict.conflictingRequest.endDate}.`
          throw new LeaveServiceError('DUPLICATE_LEAVE_REQUEST', message, {
            startDate: message,
          })
        }

        if (conflict?.kind === 'overlap') {
          const message = `Dates overlap with an existing ${conflict.conflictingRequest.status} request (${conflict.conflictingRequest.startDate} to ${conflict.conflictingRequest.endDate}).`
          throw new LeaveServiceError('OVERLAPPING_LEAVE_REQUEST', message, {
            startDate: message,
          })
        }

        const nowIso = referenceNow.toISOString()
        const calendarDays = calculateInclusiveCalendarDays(
          parsed.data.startDate,
          parsed.data.endDate,
        )

        const created: LeaveRequest = {
          id: generateLeaveRequestId(),
          employeeId: targetEmployee.employeeId,
          employeeName: targetEmployee.fullName,
          department: targetEmployee.department,
          leaveType: parsed.data.leaveType,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          calendarDays,
          reason: parsed.data.reason,
          status: 'Pending',
          businessTimezone: BUSINESS_TIMEZONE,
          submittedAtUtc: nowIso,
          reviewedByEmployeeId: null,
          reviewedByName: null,
          reviewedByRole: null,
          reviewedAtUtc: null,
          reviewerNote: null,
          cancelledAtUtc: null,
          decisionHistory: [
            {
              action: 'Submitted',
              actorEmployeeId: targetEmployee.employeeId,
              actorName: targetEmployee.fullName,
              actorRole: targetEmployee.assignedRole,
              timestampUtc: nowIso,
              note: parsed.data.reason || null,
            },
          ],
          updatedAtUtc: nowIso,
        }

        writeStoredRequests([created, ...existing])
        return created
      })
    },

    async cancelLeaveRequest(
      requestId: string,
      actor: LeaveActorContext,
      note?: string,
    ): Promise<LeaveRequest> {
      return withLock(`req:${requestId}`, async () => {
        const { actorEmployee } = await resolveActor(actor)
        if (!hasPermission(actorEmployee, 'leave.request')) {
          throw new LeaveServiceError(
            'UNAUTHORIZED',
            'You do not have permission to cancel leave requests.',
            undefined,
            403,
          )
        }
        const requests = readStoredRequests()
        const index = requests.findIndex((item) => item.id === requestId)

        if (index === -1) {
          throw new LeaveServiceError(
            'REQUEST_NOT_FOUND',
            'Leave request record was not found.',
          )
        }

        const existingRequest = requests[index]
        if (
          normalizeEmployeeId(existingRequest.employeeId) !==
          normalizeEmployeeId(actorEmployee.employeeId)
        ) {
          throw new LeaveServiceError(
            'UNAUTHORIZED',
            'You are only authorized to cancel your own leave requests.',
          )
        }

        if (existingRequest.status !== 'Pending') {
          throw new LeaveServiceError(
            'INVALID_STATUS_TRANSITION',
            `Only Pending leave requests can be cancelled (current status: ${existingRequest.status}).`,
          )
        }

        const trimmedNote = note?.trim() ?? ''
        const nowIso = now().toISOString()

        const updated: LeaveRequest = {
          ...existingRequest,
          status: 'Cancelled',
          cancelledAtUtc: nowIso,
          updatedAtUtc: nowIso,
          decisionHistory: [
            ...existingRequest.decisionHistory,
            {
              action: 'Cancelled',
              actorEmployeeId: actorEmployee.employeeId,
              actorName: actorEmployee.fullName,
              actorRole: actorEmployee.assignedRole,
              timestampUtc: nowIso,
              note: trimmedNote || null,
            },
          ],
        }

        writeStoredRequests(
          requests.map((item, idx) => (idx === index ? updated : item)),
        )
        return updated
      })
    },

    async reviewLeaveRequest(
      input: ReviewLeaveRequestInput,
      actor: LeaveActorContext,
    ): Promise<LeaveRequest> {
      return withLock(`req:${input.requestId}`, async () => {
        const { actorEmployee } = await resolveActor(actor)

        const requiredPermission =
          input.decision === 'Approved' ? 'leave.approve' : 'leave.reject'
        if (!hasPermission(actorEmployee, requiredPermission)) {
          throw new LeaveServiceError(
            'UNAUTHORIZED',
            'You are not authorized to approve or reject leave requests.',
            undefined,
            403,
          )
        }

        const trimmedNote = (input.reviewerNote ?? '').trim()
        if (trimmedNote.length > LEAVE_FIELD_LIMITS.reviewerNoteMax) {
          throw new LeaveServiceError(
            'VALIDATION_ERROR',
            `Reviewer note cannot exceed ${LEAVE_FIELD_LIMITS.reviewerNoteMax} characters.`,
          )
        }

        const requests = readStoredRequests()
        const index = requests.findIndex((item) => item.id === input.requestId)

        if (index === -1) {
          throw new LeaveServiceError(
            'REQUEST_NOT_FOUND',
            'Leave request record was not found.',
          )
        }

        const existingRequest = requests[index]

        const decisionCheck = canApproveOrRejectLeave(
          actorEmployee,
          existingRequest,
        )
        if (!decisionCheck.allowed) {
          if (existingRequest.status !== 'Pending') {
            throw new LeaveServiceError(
              'INVALID_STATUS_TRANSITION',
              `Leave request is already ${existingRequest.status} and cannot transition to ${input.decision}.`,
            )
          }
          throw new LeaveServiceError(
            'UNAUTHORIZED',
            decisionCheck.reason ??
              'You are not authorized to review this leave request.',
            undefined,
            403,
          )
        }

        const nowIso = now().toISOString()
        const updated: LeaveRequest = {
          ...existingRequest,
          status: input.decision,
          reviewedByEmployeeId: actorEmployee.employeeId,
          reviewedByName: actorEmployee.fullName,
          reviewedByRole: actorEmployee.assignedRole,
          reviewedAtUtc: nowIso,
          reviewerNote: trimmedNote || null,
          updatedAtUtc: nowIso,
          decisionHistory: [
            ...existingRequest.decisionHistory,
            {
              action: input.decision,
              actorEmployeeId: actorEmployee.employeeId,
              actorName: actorEmployee.fullName,
              actorRole: actorEmployee.assignedRole,
              timestampUtc: nowIso,
              note: trimmedNote || null,
            },
          ],
        }

        writeStoredRequests(
          requests.map((item, idx) => (idx === index ? updated : item)),
        )
        return updated
      })
    },

    async clearLeaveRequests(actor: LeaveActorContext): Promise<LeaveRequest[]> {
      const { actorEmployee } = await resolveActor(actor)
      if (!hasPermission(actorEmployee, 'employees.delete')) {
        throw new LeaveServiceError(
          'UNAUTHORIZED',
          'Only an HR Admin can clear demo leave requests.',
          undefined,
          403,
        )
      }
      writeStoredRequests([])
      return []
    },
  }
}

export const leaveService: LeaveService = isBackendApiConfigured()
  ? createApiLeaveService()
  : createDemoLeaveService()

