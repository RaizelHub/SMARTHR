import { useCallback, useEffect, useMemo, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import { useAuth } from '../features/auth/authContextStore'
import { normalizeEmployeeId } from '../features/employees/validation/employeeSchema'
import LeaveRequestForm from '../features/leave/components/LeaveRequestForm'
import LeaveRequestHistoryTable from '../features/leave/components/LeaveRequestHistoryTable'
import LeaveReviewQueue from '../features/leave/components/LeaveReviewQueue'
import {
  leaveService as defaultLeaveService,
  type LeaveService,
} from '../features/leave/services/leaveService'
import type { LeaveRequest, SubmitLeaveRequestInput } from '../types/leave'

interface LeavePageProps {
  lvService?: LeaveService
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

export default function Leave({
  lvService = defaultLeaveService,
}: LeavePageProps) {
  const auth = useAuth()
  const actingEmployee = auth.currentUser
  const actorEmployeeId = auth.actorContext.actorEmployeeId
  const sessionExpiresAtUtc = auth.actorContext.sessionExpiresAtUtc

  const [visibleRequests, setVisibleRequests] = useState<LeaveRequest[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const ownRequests = useMemo(() => {
    if (!actingEmployee) {
      return []
    }
    const ownKey = normalizeEmployeeId(actingEmployee.employeeId)
    return visibleRequests.filter(
      (request) => normalizeEmployeeId(request.employeeId) === ownKey,
    )
  }, [actingEmployee, visibleRequests])

  const loadWorkspace = useCallback(async () => {
    return lvService.listLeaveRequests({
      actorEmployeeId,
      sessionExpiresAtUtc,
    })
  }, [actorEmployeeId, lvService, sessionExpiresAtUtc])

  useEffect(() => {
    let cancelled = false

    loadWorkspace()
      .then((loadedRequests) => {
        if (!cancelled) {
          setVisibleRequests(loadedRequests)
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            getErrorMessage(error, 'Failed to load leave management workspace.'),
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [loadWorkspace])

  const handleRetryLoad = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setActionError(null)
    try {
      const loadedRequests = await loadWorkspace()
      setVisibleRequests(loadedRequests)
    } catch (error: unknown) {
      setLoadError(
        getErrorMessage(error, 'Failed to load leave management workspace.'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadWorkspace])

  const handleSubmitRequest = useCallback(
    async (input: SubmitLeaveRequestInput): Promise<LeaveRequest> => {
      if (!actingEmployee) {
        throw new Error('An authenticated employee session is required.')
      }

      setActionError(null)
      setActionSuccess(null)

      const actor = {
        actorEmployeeId: actingEmployee.employeeId,
        sessionExpiresAtUtc,
      }
      const created = await lvService.submitLeaveRequest(input, actor)
      const refreshed = await lvService.listLeaveRequests(actor)
      setVisibleRequests(refreshed)
      return created
    },
    [actingEmployee, lvService, sessionExpiresAtUtc],
  )

  const handleCancelRequest = useCallback(
    async (requestId: string) => {
      if (!actingEmployee) {
        return
      }

      setBusyRequestId(requestId)
      setActionError(null)
      setActionSuccess(null)

      try {
        const actor = {
          actorEmployeeId: actingEmployee.employeeId,
          sessionExpiresAtUtc,
        }
        const cancelled = await lvService.cancelLeaveRequest(requestId, actor)
        const refreshed = await lvService.listLeaveRequests(actor)
        setVisibleRequests(refreshed)
        setActionSuccess(
          `Cancelled ${cancelled.leaveType} request (${cancelled.startDate} to ${cancelled.endDate}).`,
        )
      } catch (error: unknown) {
        setActionError(getErrorMessage(error, 'Failed to cancel leave request.'))
      } finally {
        setBusyRequestId(null)
      }
    },
    [actingEmployee, lvService, sessionExpiresAtUtc],
  )

  const handleReviewRequest = useCallback(
    async (
      requestId: string,
      decision: 'Approved' | 'Rejected',
      reviewerNote: string,
    ) => {
      if (!actingEmployee) {
        return
      }

      setBusyRequestId(requestId)
      setActionError(null)
      setActionSuccess(null)

      try {
        const actor = {
          actorEmployeeId: actingEmployee.employeeId,
          sessionExpiresAtUtc,
        }
        const decided = await lvService.reviewLeaveRequest(
          { requestId, decision, reviewerNote },
          actor,
        )
        const refreshed = await lvService.listLeaveRequests(actor)
        setVisibleRequests(refreshed)
        setActionSuccess(
          `${decided.status} ${decided.employeeName}'s ${decided.leaveType} request (${decided.startDate} to ${decided.endDate}).`,
        )
      } catch (error: unknown) {
        setActionError(getErrorMessage(error, 'Failed to review leave request.'))
      } finally {
        setBusyRequestId(null)
      }
    },
    [actingEmployee, lvService, sessionExpiresAtUtc],
  )

  const canSubmitRequest = auth.hasPermission('leave.request')
  const showReviewQueue = Boolean(
    actingEmployee && auth.hasAnyPermission(['leave.approve', 'leave.reject']),
  )

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Leave Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Submit leave requests, track approval status, and review requests
            within your authorized role scope.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {lvService.isDemoMode && (
            <div
              role="note"
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <span className="font-medium">Demo-Only Persistence:</span> No
              backend server or database is connected. Leave requests and
              decisions are stored locally in browser{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
                localStorage
              </code>
              .
            </div>
          )}

          {!lvService.balanceTrackingSupported && (
            <div
              role="note"
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
            >
              <span className="font-medium text-slate-900">
                Leave Balances Not Configured:
              </span>{' '}
              Company leave entitlements, statutory accruals, and holiday/weekend
              deduction policies are not yet defined. Leave balances will be
              integrated once HR policies are configured.
            </div>
          )}
        </div>

        {actionError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {actionError}
          </div>
        )}

        {actionSuccess && (
          <div
            role="status"
            className="flex items-start justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            <span>{actionSuccess}</span>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="rounded px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              Dismiss
            </button>
          </div>
        )}

        {canSubmitRequest && (
          <LeaveRequestForm
            employee={actingEmployee}
            existingRequests={ownRequests}
            onSubmitRequest={handleSubmitRequest}
          />
        )}

        <LeaveRequestHistoryTable
          requests={ownRequests}
          isLoading={isLoading}
          loadError={loadError}
          busyRequestId={busyRequestId}
          actingEmployeeLabel={
            actingEmployee
              ? `${actingEmployee.fullName} (${actingEmployee.employeeId})`
              : null
          }
          onRetryLoad={() => void handleRetryLoad()}
          onCancelRequest={handleCancelRequest}
        />

        {showReviewQueue && actingEmployee && (
          <LeaveReviewQueue
            reviewer={actingEmployee}
            requests={visibleRequests}
            isLoading={isLoading}
            busyRequestId={busyRequestId}
            onReviewRequest={handleReviewRequest}
          />
        )}
      </div>
    </AppLayout>
  )
}
