import {
  BUSINESS_TIMEZONE,
  type AttendanceActorContext,
  type AttendanceRecord,
  type ClockInInput,
  type ClockOutInput,
} from '../../../types/attendance'
import type { Employee } from '../../../types/employee'
import {
  canViewAttendanceRecord,
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
  calculateDurationMinutes,
  getBusinessDateString,
} from '../utils/timeZone'

/**
 * DEMO-ONLY ATTENDANCE PERSISTENCE LAYER
 *
 * Smart HR does not currently have a backend server or database connected.
 * Attendance sessions are persisted solely in browser localStorage and use
 * client-generated UTC timestamps for Phase 2 workflow demonstration.
 * Commercial deployment requires server-authoritative timestamps, database
 * uniqueness constraints on active sessions, and verified auth middleware.
 */
export const DEMO_ATTENDANCE_STORAGE_KEY = 'smarthr.demo.attendance.v1'

export type AttendanceServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_INACTIVE'
  | 'DUPLICATE_CLOCK_IN'
  | 'NO_ACTIVE_SESSION'
  | 'DUPLICATE_CLOCK_OUT'
  | 'INVALID_TIMESTAMP_ORDER'
  | 'PERSISTENCE_ERROR'

export class AttendanceServiceError extends Error {
  readonly code: AttendanceServiceErrorCode
  readonly httpStatus: 400 | 401 | 403 | 404 | 409 | 500

  constructor(
    code: AttendanceServiceErrorCode,
    message: string,
    httpStatus?: 400 | 401 | 403 | 404 | 409 | 500,
  ) {
    super(message)
    this.name = 'AttendanceServiceError'
    this.code = code
    this.httpStatus =
      httpStatus ??
      (code === 'UNAUTHORIZED' || code === 'EMPLOYEE_INACTIVE'
        ? 403
        : code === 'EMPLOYEE_NOT_FOUND' || code === 'NO_ACTIVE_SESSION'
          ? 404
          : code === 'INVALID_TIMESTAMP_ORDER'
            ? 400
            : code === 'PERSISTENCE_ERROR'
              ? 500
              : 409)
  }
}

export interface DemoAttendanceServiceOptions {
  employeeService?: EmployeeService
  storage?: StorageLike | null
  now?: () => Date
}

export interface AttendanceService {
  readonly isDemoMode: boolean
  readonly businessTimezone: string
  listAttendanceRecords(
    actor: AttendanceActorContext,
  ): Promise<AttendanceRecord[]>
  getActiveSession(
    employeeId: string,
    actor: AttendanceActorContext,
  ): Promise<AttendanceRecord | null>
  clockIn(
    input: ClockInInput,
    actor: AttendanceActorContext,
  ): Promise<AttendanceRecord>
  clockOut(
    input: ClockOutInput,
    actor: AttendanceActorContext,
  ): Promise<AttendanceRecord>
  clearAttendanceRecords(
    actor: AttendanceActorContext,
  ): Promise<AttendanceRecord[]>
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

function generateAttendanceId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `att-${globalThis.crypto.randomUUID()}`
  }
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isAttendanceRecord(value: unknown): value is AttendanceRecord {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.employeeId === 'string' &&
    typeof record.employeeName === 'string' &&
    typeof record.attendanceDate === 'string' &&
    typeof record.clockInAtUtc === 'string' &&
    (record.clockOutAtUtc === null || typeof record.clockOutAtUtc === 'string') &&
    (record.durationMinutes === null ||
      typeof record.durationMinutes === 'number') &&
    (record.status === 'Clocked In' || record.status === 'Clocked Out') &&
    typeof record.businessTimezone === 'string' &&
    typeof record.createdAtUtc === 'string' &&
    typeof record.updatedAtUtc === 'string'
  )
}

export function createDemoAttendanceService(
  options: DemoAttendanceServiceOptions = {},
): AttendanceService {
  const empService = options.employeeService ?? defaultEmployeeService
  const now = options.now ?? (() => new Date())
  let fallbackMemoryStore: AttendanceRecord[] = []
  const employeeLocks = new Map<string, Promise<unknown>>()

  function resolveStorage(): StorageLike | null {
    if (options.storage !== undefined) {
      return options.storage
    }
    return getDefaultStorage()
  }

  async function withEmployeeLock<T>(
    employeeId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockKey = normalizeEmployeeId(employeeId) || '__empty__'
    const previous = employeeLocks.get(lockKey) ?? Promise.resolve()

    const current = previous.then(
      () => operation(),
      () => operation(),
    )

    const tail = current.then(
      () => undefined,
      () => undefined,
    )
    employeeLocks.set(lockKey, tail)

    try {
      return await current
    } finally {
      if (employeeLocks.get(lockKey) === tail) {
        employeeLocks.delete(lockKey)
      }
    }
  }

  function readStoredRecords(): AttendanceRecord[] {
    const storage = resolveStorage()
    if (!storage) {
      return fallbackMemoryStore.map((record) => ({ ...record }))
    }

    let raw: string | null
    try {
      raw = storage.getItem(DEMO_ATTENDANCE_STORAGE_KEY)
    } catch {
      throw new AttendanceServiceError(
        'PERSISTENCE_ERROR',
        'Unable to read attendance records from browser storage.',
      )
    }

    if (raw === null) {
      return []
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || !parsed.every(isAttendanceRecord)) {
        throw new Error('Invalid attendance storage format')
      }
      return parsed
    } catch {
      throw new AttendanceServiceError(
        'PERSISTENCE_ERROR',
        'Stored demo attendance data is corrupted. Clear demo attendance data to recover.',
      )
    }
  }

  function writeStoredRecords(records: AttendanceRecord[]): void {
    const storage = resolveStorage()
    if (!storage) {
      fallbackMemoryStore = records.map((record) => ({ ...record }))
      return
    }

    try {
      storage.setItem(DEMO_ATTENDANCE_STORAGE_KEY, JSON.stringify(records))
    } catch {
      throw new AttendanceServiceError(
        'PERSISTENCE_ERROR',
        'Unable to save attendance record to browser storage. Check storage availability or quota.',
      )
    }
  }

  async function resolveAuthorizedActor(
    actor: AttendanceActorContext,
  ): Promise<{ actorEmployee: Employee; allEmployees: Employee[] }> {
    const rawActorId = actor.actorEmployeeId?.trim() ?? ''
    if (!rawActorId) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'An authenticated employee session is required to access attendance.',
        401,
      )
    }

    if (isSessionExpired(actor.sessionExpiresAtUtc, now())) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'Your session has expired. Please sign in again.',
        401,
      )
    }

    const allEmployees = await empService.listAllDirectoryForServiceInternal()
    const normalizedActorId = normalizeEmployeeId(rawActorId)
    const actorEmployee = allEmployees.find(
      (employee) => normalizeEmployeeId(employee.employeeId) === normalizedActorId,
    )

    if (!actorEmployee) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'Current session identity does not match an active employee record.',
        401,
      )
    }

    if (actorEmployee.employmentStatus === 'Inactive') {
      throw new AttendanceServiceError(
        'EMPLOYEE_INACTIVE',
        'Inactive employees cannot access attendance actions.',
        403,
      )
    }

    return { actorEmployee, allEmployees }
  }

  async function resolveSelfServiceTarget(
    targetEmployeeId: string,
    actor: AttendanceActorContext,
    requiredPermission: 'attendance.read_own' | 'attendance.record_own',
  ): Promise<Employee> {
    const { actorEmployee, allEmployees } = await resolveAuthorizedActor(actor)

    if (!hasPermission(actorEmployee, requiredPermission)) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'Your role does not have permission to perform this attendance action.',
        403,
      )
    }

    const trimmedTargetId = targetEmployeeId.trim()
    if (!trimmedTargetId) {
      throw new AttendanceServiceError(
        'EMPLOYEE_NOT_FOUND',
        'Employee ID is required to record attendance.',
      )
    }

    const normalizedTargetId = normalizeEmployeeId(trimmedTargetId)
    const targetEmployee = allEmployees.find(
      (employee) => normalizeEmployeeId(employee.employeeId) === normalizedTargetId,
    )

    if (!targetEmployee) {
      throw new AttendanceServiceError(
        'EMPLOYEE_NOT_FOUND',
        `Employee record "${trimmedTargetId}" was not found.`,
      )
    }

    if (
      normalizeEmployeeId(actorEmployee.employeeId) !==
      normalizeEmployeeId(targetEmployee.employeeId)
    ) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'You are not authorized to submit or modify attendance for another employee.',
        403,
      )
    }

    return targetEmployee
  }

  function sortNewestFirst(records: AttendanceRecord[]): AttendanceRecord[] {
    return [...records].sort(
      (a, b) => Date.parse(b.clockInAtUtc) - Date.parse(a.clockInAtUtc),
    )
  }

  return {
    isDemoMode: true,
    businessTimezone: BUSINESS_TIMEZONE,

    async listAttendanceRecords(
      actor: AttendanceActorContext,
    ): Promise<AttendanceRecord[]> {
      const { actorEmployee, allEmployees } = await resolveAuthorizedActor(actor)
      if (
        !hasAnyPermission(actorEmployee, [
          'attendance.read_own',
          'attendance.read_team',
          'attendance.read_all',
        ])
      ) {
        throw new AttendanceServiceError(
          'UNAUTHORIZED',
          'You do not have permission to view attendance records.',
          403,
        )
      }

      const employeeMap = new Map<string, Employee>(
        allEmployees.map((emp) => [normalizeEmployeeId(emp.employeeId), emp]),
      )

      const records = readStoredRecords().map((record) => {
        const currentEmployee = employeeMap.get(
          normalizeEmployeeId(record.employeeId),
        )
        return currentEmployee
          ? { ...record, employeeName: currentEmployee.fullName }
          : record
      })

      const scoped = records.filter((record) => {
        const ownerDepartment = employeeMap.get(
          normalizeEmployeeId(record.employeeId),
        )?.department
        return canViewAttendanceRecord(actorEmployee, record, ownerDepartment)
      })

      return sortNewestFirst(scoped)
    },

    async getActiveSession(
      employeeId: string,
      actor: AttendanceActorContext,
    ): Promise<AttendanceRecord | null> {
      const targetEmployee = await resolveSelfServiceTarget(
        employeeId,
        actor,
        'attendance.read_own',
      )
      const records = readStoredRecords()
      const targetKey = normalizeEmployeeId(targetEmployee.employeeId)

      const active = sortNewestFirst(records).find(
        (record) =>
          normalizeEmployeeId(record.employeeId) === targetKey &&
          record.status === 'Clocked In' &&
          record.clockOutAtUtc === null,
      )

      return active ?? null
    },

    async clockIn(
      input: ClockInInput,
      actor: AttendanceActorContext,
    ): Promise<AttendanceRecord> {
      return withEmployeeLock(input.employeeId ?? '', async () => {
        const targetEmployee = await resolveSelfServiceTarget(
          input.employeeId,
          actor,
          'attendance.record_own',
        )

        if (targetEmployee.employmentStatus === 'Inactive') {
          throw new AttendanceServiceError(
            'EMPLOYEE_INACTIVE',
            'Inactive employees cannot clock in to start a work session.',
          )
        }

        const records = readStoredRecords()
        const targetKey = normalizeEmployeeId(targetEmployee.employeeId)
        const existingActive = records.find(
          (record) =>
            normalizeEmployeeId(record.employeeId) === targetKey &&
            record.status === 'Clocked In' &&
            record.clockOutAtUtc === null,
        )

        if (existingActive) {
          throw new AttendanceServiceError(
            'DUPLICATE_CLOCK_IN',
            `${targetEmployee.fullName} (${targetEmployee.employeeId}) already has an active clock-in session.`,
          )
        }

        const nowIso = now().toISOString()
        const attendanceDate = getBusinessDateString(nowIso, BUSINESS_TIMEZONE)

        const created: AttendanceRecord = {
          id: generateAttendanceId(),
          employeeId: targetEmployee.employeeId,
          employeeName: targetEmployee.fullName,
          attendanceDate,
          clockInAtUtc: nowIso,
          clockOutAtUtc: null,
          durationMinutes: null,
          status: 'Clocked In',
          businessTimezone: BUSINESS_TIMEZONE,
          createdAtUtc: nowIso,
          updatedAtUtc: nowIso,
        }

        writeStoredRecords([created, ...records])
        return created
      })
    },

    async clockOut(
      input: ClockOutInput,
      actor: AttendanceActorContext,
    ): Promise<AttendanceRecord> {
      return withEmployeeLock(input.employeeId ?? '', async () => {
        const targetEmployee = await resolveSelfServiceTarget(
          input.employeeId,
          actor,
          'attendance.record_own',
        )

        const records = readStoredRecords()
        const targetKey = normalizeEmployeeId(targetEmployee.employeeId)

        let activeIndex = -1

        if (input.sessionId) {
          const matchingIndex = records.findIndex(
            (record) =>
              record.id === input.sessionId &&
              normalizeEmployeeId(record.employeeId) === targetKey,
          )

          if (matchingIndex === -1) {
            throw new AttendanceServiceError(
              'NO_ACTIVE_SESSION',
              'No matching active clock-in session was found to clock out.',
            )
          }

          if (records[matchingIndex].status === 'Clocked Out') {
            throw new AttendanceServiceError(
              'DUPLICATE_CLOCK_OUT',
              'This attendance session has already been clocked out.',
            )
          }

          activeIndex = matchingIndex
        } else {
          activeIndex = records.findIndex(
            (record) =>
              normalizeEmployeeId(record.employeeId) === targetKey &&
              record.status === 'Clocked In' &&
              record.clockOutAtUtc === null,
          )

          if (activeIndex === -1) {
            const hasPreviousSessions = records.some(
              (record) => normalizeEmployeeId(record.employeeId) === targetKey,
            )

            if (hasPreviousSessions) {
              throw new AttendanceServiceError(
                'DUPLICATE_CLOCK_OUT',
                `${targetEmployee.fullName} is already clocked out. Clock in to begin a new session.`,
              )
            }

            throw new AttendanceServiceError(
              'NO_ACTIVE_SESSION',
              'Cannot clock out without an active clock-in session.',
            )
          }
        }

        const activeSession = records[activeIndex]
        const nowIso = now().toISOString()

        let durationMinutes: number
        try {
          durationMinutes = calculateDurationMinutes(
            activeSession.clockInAtUtc,
            nowIso,
          )
        } catch {
          throw new AttendanceServiceError(
            'INVALID_TIMESTAMP_ORDER',
            'Clock-out timestamp cannot be earlier than the active clock-in timestamp.',
          )
        }

        const completed: AttendanceRecord = {
          ...activeSession,
          employeeName: targetEmployee.fullName,
          clockOutAtUtc: nowIso,
          durationMinutes,
          status: 'Clocked Out',
          updatedAtUtc: nowIso,
        }

        const updatedRecords = records.map((record, index) =>
          index === activeIndex ? completed : record,
        )

        writeStoredRecords(updatedRecords)
        return completed
      })
    },

    async clearAttendanceRecords(
      actor: AttendanceActorContext,
    ): Promise<AttendanceRecord[]> {
      const { actorEmployee } = await resolveAuthorizedActor(actor)
      if (!hasPermission(actorEmployee, 'employees.delete')) {
        throw new AttendanceServiceError(
          'UNAUTHORIZED',
          'Only an HR Admin can clear attendance records.',
          403,
        )
      }
      writeStoredRecords([])
      return []
    },
  }
}

export const attendanceService: AttendanceService = createDemoAttendanceService()

