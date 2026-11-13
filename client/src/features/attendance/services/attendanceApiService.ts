import type { AxiosInstance } from 'axios'
import {
  BUSINESS_TIMEZONE,
  type AttendanceRecord,
  type ClockInInput,
  type ClockOutInput,
} from '../../../types/attendance'
import { ApiClientError, createApiHttpClient } from '../../api/httpClient'
import {
  AttendanceServiceError,
  type AttendanceService,
  type AttendanceServiceErrorCode,
} from './attendanceService'

export interface ApiAttendanceServiceOptions {
  httpClient?: AxiosInstance
}

function mapErrorCode(code: string, status: number): AttendanceServiceErrorCode {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'EMPLOYEE_NOT_FOUND':
    case 'EMPLOYEE_INACTIVE':
    case 'DUPLICATE_CLOCK_IN':
    case 'NO_ACTIVE_SESSION':
    case 'DUPLICATE_CLOCK_OUT':
    case 'INVALID_TIMESTAMP_ORDER':
    case 'PERSISTENCE_ERROR':
      return code
    default:
      if (status === 401 || status === 403) return 'UNAUTHORIZED'
      if (status === 404) return 'NO_ACTIVE_SESSION'
      if (status === 400 || status === 422) return 'INVALID_TIMESTAMP_ORDER'
      if (status === 409) return 'DUPLICATE_CLOCK_IN'
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
  if (status === 422) return 400
  return 500
}

function rethrowAsAttendanceError(error: unknown, fallback: string): never {
  if (error instanceof AttendanceServiceError) {
    throw error
  }
  if (error instanceof ApiClientError) {
    throw new AttendanceServiceError(
      mapErrorCode(error.code, error.httpStatus),
      error.message,
      mapHttpStatus(error.httpStatus),
    )
  }
  throw new AttendanceServiceError(
    'PERSISTENCE_ERROR',
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : fallback,
    500,
  )
}

export function createApiAttendanceService(
  options: ApiAttendanceServiceOptions = {},
): AttendanceService {
  const client = options.httpClient ?? createApiHttpClient()

  return {
    isDemoMode: false,
    businessTimezone: BUSINESS_TIMEZONE,

    async listAttendanceRecords(): Promise<AttendanceRecord[]> {
      try {
        const res = await client.get<{ records: AttendanceRecord[] }>('/attendance')
        return res.data.records
      } catch (error) {
        rethrowAsAttendanceError(error, 'Failed to load attendance records.')
      }
    },

    async getActiveSession(employeeId: string): Promise<AttendanceRecord | null> {
      try {
        const res = await client.get<{ session: AttendanceRecord | null }>(
          '/attendance/active',
          {
            params: employeeId.trim() ? { employeeId: employeeId.trim() } : undefined,
          },
        )
        return res.data.session
      } catch (error) {
        rethrowAsAttendanceError(error, 'Failed to inspect active attendance status.')
      }
    },

    async clockIn(input: ClockInInput): Promise<AttendanceRecord> {
      try {
        const res = await client.post<{ record: AttendanceRecord }>(
          '/attendance/clock-in',
          { employeeId: input.employeeId },
        )
        return res.data.record
      } catch (error) {
        rethrowAsAttendanceError(error, 'Unable to clock in.')
      }
    },

    async clockOut(input: ClockOutInput): Promise<AttendanceRecord> {
      try {
        const res = await client.post<{ record: AttendanceRecord }>(
          '/attendance/clock-out',
          {
            employeeId: input.employeeId,
            sessionId: input.sessionId ?? null,
          },
        )
        return res.data.record
      } catch (error) {
        rethrowAsAttendanceError(error, 'Unable to clock out.')
      }
    },

    async clearAttendanceRecords(): Promise<AttendanceRecord[]> {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'Clearing attendance records is disabled when connected to the Laravel API.',
        403,
      )
    },
  }
}

