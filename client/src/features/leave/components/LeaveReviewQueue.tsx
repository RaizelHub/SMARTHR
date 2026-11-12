import { useMemo, useState } from 'react'
import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import type { Employee } from '../../../types/employee'
import {
  LEAVE_REQUEST_STATUSES,
  type LeaveRequest,
  type LeaveRequestStatus,
} from '../../../types/leave'
import { formatDateTimeInBusinessZone } from '../../attendance/utils/timeZone'
import {
  canApproveOrRejectLeave,
  hasPermission,
} from '../../auth/permissions'
import { LEAVE_FIELD_LIMITS } from '../validation/leaveSchema'
import { getLeaveStatusBadgeClasses } from '../utils/leaveStatusBadge'

interface LeaveReviewQueueProps {
  reviewer: Employee
  requests: readonly LeaveRequest[]
  isLoading: boolean
  busyRequestId: string | null
  onReviewRequest: (
    requestId: string,
    decision: 'Approved' | 'Rejected',
    reviewerNote: string,
  ) => Promise<void>
}

type StatusFilter = 'All' | LeaveRequestStatus

export default function LeaveReviewQueue({
  reviewer,
  requests,
  isLoading,
  busyRequestId,
  onReviewRequest,
}: LeaveReviewQueueProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [notesByRequestId, setNotesByRequestId] = useState<
    Record<string, string>
  >({})
  const [pendingDecision, setPendingDecision] = useState<{
    requestId: string
    decision: 'Approved' | 'Rejected'
  } | null>(null)

  const filteredRequests = useMemo(() => {
    if (statusFilter === 'All') {
      return requests
    }
    return requests.filter((request) => request.status === statusFilter)
  }, [requests, statusFilter])

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === 'Pending').length,
    [requests],
  )

  async function handleConfirmDecision(
    requestId: string,
    decision: 'Approved' | 'Rejected',
  ) {
    const note = notesByRequestId[requestId] ?? ''
    await onReviewRequest(requestId, decision, note)
    setPendingDecision(null)
    setNotesByRequestId((previous) => {
      const next = { ...previous }
      delete next[requestId]
      return next
    })
  }

  return (
    <section
      aria-labelledby="leave-review-queue-heading"
      className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              id="leave-review-queue-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Manager &amp; HR Leave Review Queue
            </h2>
            <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              {pendingCount} Pending
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {hasPermission(reviewer, 'leave.read_all')
              ? `HR organization scope (${reviewer.assignedRole}). Reviewers cannot approve or reject their own requests.`
              : `Department scope: ${reviewer.department}. Reviewers cannot approve or reject their own requests.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="leave-review-status-filter"
            className="text-xs font-medium text-slate-700"
          >
            Filter Status
          </label>
          <select
            id="leave-review-status-filter"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="All">All ({requests.length})</option>
            {LEAVE_REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div
          aria-busy="true"
          className="py-10 text-center text-sm text-slate-600"
        >
          Loading review queue...
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            No leave requests match this view
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {statusFilter === 'All'
              ? 'Leave requests submitted within your review scope will appear here.'
              : `No requests currently have status "${statusFilter}".`}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {filteredRequests.map((request) => {
            const eligibility = canApproveOrRejectLeave(reviewer, request)
            const isBusy = busyRequestId === request.id
            const isConfirming = pendingDecision?.requestId === request.id
            const noteValue = notesByRequestId[request.id] ?? ''

            return (
              <article
                key={request.id}
                aria-label={`Leave request from ${request.employeeName}`}
                className="rounded-md border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {request.employeeName}
                      </span>
                      <span className="font-mono text-xs text-slate-600">
                        {request.employeeId}
                      </span>
                      <span className="text-xs text-slate-500">
                        · {request.department}
                      </span>
                      <span className={getLeaveStatusBadgeClasses(request.status)}>
                        {request.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-800">
                      <span className="font-medium">{request.leaveType}</span> ·{' '}
                      {request.startDate} to {request.endDate} (
                      {request.calendarDays} calendar day
                      {request.calendarDays === 1 ? '' : 's'})
                    </p>
                    {request.reason && (
                      <p className="mt-1 text-xs text-slate-600">
                        Reason: {request.reason}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Submitted{' '}
                      {formatDateTimeInBusinessZone(
                        request.submittedAtUtc,
                        BUSINESS_TIMEZONE,
                      )}
                    </p>
                  </div>
                </div>

                {request.decisionHistory.length > 0 && (
                  <div className="mt-3 border-t border-slate-200 pt-2.5 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">
                      Audit Trail:
                    </span>{' '}
                    {request.decisionHistory
                      .map(
                        (entry) =>
                          `${entry.action} by ${entry.actorName} (${entry.actorRole})`,
                      )
                      .join(' → ')}
                    {request.reviewerNote && (
                      <span className="ml-2 text-slate-700">
                        · Reviewer note: “{request.reviewerNote}”
                      </span>
                    )}
                  </div>
                )}

                {request.status === 'Pending' && !eligibility.allowed && (
                  <p className="mt-3 text-xs font-medium text-slate-600">
                    {eligibility.reason}
                  </p>
                )}

                {eligibility.allowed && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex-1">
                      <label
                        htmlFor={`reviewer-note-${request.id}`}
                        className="block text-xs font-medium text-slate-700"
                      >
                        Reviewer Note (Optional)
                      </label>
                      <input
                        id={`reviewer-note-${request.id}`}
                        type="text"
                        maxLength={LEAVE_FIELD_LIMITS.reviewerNoteMax}
                        value={noteValue}
                        disabled={isBusy}
                        onChange={(event) =>
                          setNotesByRequestId((previous) => ({
                            ...previous,
                            [request.id]: event.target.value,
                          }))
                        }
                        placeholder="Optional decision note"
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    {isConfirming && pendingDecision ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleConfirmDecision(
                              request.id,
                              pendingDecision.decision,
                            )
                          }
                          className={
                            pendingDecision.decision === 'Approved'
                              ? 'rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-600'
                              : 'rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-red-600'
                          }
                        >
                          {isBusy
                            ? 'Saving...'
                            : pendingDecision.decision === 'Approved'
                              ? 'Confirm Approve'
                              : 'Confirm Reject'}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setPendingDecision(null)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          Back
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busyRequestId !== null}
                          onClick={() =>
                            setPendingDecision({
                              requestId: request.id,
                              decision: 'Approved',
                            })
                          }
                          className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyRequestId !== null}
                          onClick={() =>
                            setPendingDecision({
                              requestId: request.id,
                              decision: 'Rejected',
                            })
                          }
                          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-red-600"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
