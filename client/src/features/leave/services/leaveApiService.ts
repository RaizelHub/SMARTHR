import type { AxiosInstance } from 'axios'
import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import type {
  LeaveActorContext,
  LeaveRequest,
  ReviewLeaveRequestInput,
  SubmitLeaveRequestInput,
} from '../../../types/leave'
import { ApiClientError, createApiHttpClient } from '../../api/httpClient'
import {
  LeaveServiceError,
  type LeaveService,
  type LeaveServiceErrorCode,
} from './leaveService'

export interface ApiLeaveServiceOptions {
  httpClient?: AxiosInstance
}

function mapErrorCode(code: string, status: number): LeaveServiceErrorCode {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'EMPLOYEE_NOT_FOUND':
    case 'EMPLOYEE_INACTIVE':
    case 'REQUEST_NOT_FOUND':
    case 'VALIDATION_ERROR':
    case 'DUPLICATE_LEAVE_REQUEST':
    case 'OVERLAPPING_LEAVE_REQUEST':
    case 'INVALID_STATUS_TRANSITION':
    case 'PERSISTENCE_ERROR':
      return code
    default:
      if (status === 401 || status === 403) return 'UNAUTHORIZED'
      if (status === 404) return 'REQUEST_NOT_FOUND'
      if (status === 400 || status === 422) return 'VALIDATION_ERROR'
      if (status === 409) return 'INVALID_STATUS_TRANSITION'
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

function rethrowAsLeaveError(error: unknown, fallback: string): never {
  if (error instanceof LeaveServiceError) {
    throw error
  }
  if (error instanceof ApiClientError) {
    throw new LeaveServiceError(
      mapErrorCode(error.code, error.httpStatus),
      error.message,
      error.fieldErrors as Partial<Record<keyof SubmitLeaveRequestInput, string>> | undefined,
      mapHttpStatus(error.httpStatus),
    )
  }
  throw new LeaveServiceError(
    'PERSISTENCE_ERROR',
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : fallback,
    undefined,
    500,
  )
}

export function createApiLeaveService(
  options: ApiLeaveServiceOptions = {},
): LeaveService {
  const client = options.httpClient ?? createApiHttpClient()

  return {
    isDemoMode: false,
    businessTimezone: BUSINESS_TIMEZONE,
    balanceTrackingSupported: false,

    async listLeaveRequests(): Promise<LeaveRequest[]> {
      try {
        const res = await client.get<{ requests: LeaveRequest[] }>('/leave-requests')
        return res.data.requests
      } catch (error) {
        rethrowAsLeaveError(error, 'Failed to load leave requests.')
      }
    },

    async submitLeaveRequest(
      input: SubmitLeaveRequestInput,
    ): Promise<LeaveRequest> {
      try {
        const res = await client.post<{ request: LeaveRequest }>(
          '/leave-requests',
          {
            employeeId: input.employeeId,
            leaveType: input.leaveType,
            startDate: input.startDate,
            endDate: input.endDate,
            reason: input.reason ?? '',
          },
        )
        return res.data.request
      } catch (error) {
        rethrowAsLeaveError(error, 'Unable to submit leave request.')
      }
    },

    async cancelLeaveRequest(
      requestId: string,
      _actor: LeaveActorContext,
      note?: string,
    ): Promise<LeaveRequest> {
      try {
        const res = await client.post<{ request: LeaveRequest }>(
          `/leave-requests/${encodeURIComponent(requestId)}/cancel`,
          { note: note ?? null },
        )
        return res.data.request
      } catch (error) {
        rethrowAsLeaveError(error, 'Unable to cancel leave request.')
      }
    },

    async reviewLeaveRequest(
      input: ReviewLeaveRequestInput,
    ): Promise<LeaveRequest> {
      try {
        const res = await client.post<{ request: LeaveRequest }>(
          `/leave-requests/${encodeURIComponent(input.requestId)}/review`,
          {
            decision: input.decision,
            reviewerNote: input.reviewerNote ?? null,
          },
        )
        return res.data.request
      } catch (error) {
        rethrowAsLeaveError(error, 'Unable to review leave request.')
      }
    },

    async clearLeaveRequests(): Promise<LeaveRequest[]> {
      throw new LeaveServiceError(
        'UNAUTHORIZED',
        'Clearing leave requests is disabled when connected to the Laravel API.',
        undefined,
        403,
      )
    },
  }
}

