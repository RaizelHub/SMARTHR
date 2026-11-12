import { useState } from 'react'
import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import type { LeaveRequest } from '../../../types/leave'
import { formatDateTimeInBusinessZone } from '../../attendance/utils/timeZone'
import { getLeaveStatusBadgeClasses } from '../utils/leaveStatusBadge'

interface LeaveRequestHistoryTableProps {
  requests: readonly LeaveRequest[]
  isLoading: boolean
  loadError: string | null
  busyRequestId: string | null
  actingEmployeeLabel: string | null
  onRetryLoad: () => void
  onCancelRequest: (requestId: string) => Promise<void>
}

export default function LeaveRequestHistoryTable({
  requests,
  isLoading,
  loadError,
  busyRequestId,
  actingEmployeeLabel,
  onRetryLoad,
  onCancelRequest,
}: LeaveRequestHistoryTableProps) {
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)

  async function handleConfirmCancel(requestId: string) {
    await onCancelRequest(requestId)
    setConfirmCancelId(null)
  }

  return (
    <section
      aria-labelledby="my-leave-history-heading"
      className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              id="my-leave-history-heading"
              className="text-lg font-semibold text-slate-900"
            >
              My Leave Requests
            </h2>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {requests.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {actingEmployeeLabel
              ? `Showing leave requests submitted by ${actingEmployeeLabel}.`
              : 'Select an employee session above to inspect leave history.'}
          </p>
        </div>
      </div>

      {isLoading && (
        <div
          aria-busy="true"
          className="py-10 text-center text-sm text-slate-600"
        >
          Loading leave requests...
        </div>
      )}

      {!isLoading && loadError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-medium">Unable to load leave requests</p>
          <p className="mt-1">{loadError}</p>
          <button
            type="button"
            onClick={onRetryLoad}
            className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !loadError && requests.length === 0 && (
        <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-800">
            No leave requests submitted yet
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Use the Request Leave form above to submit a leave request.
          </p>
        </div>
      )}

      {!isLoading && !loadError && requests.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table
            aria-label="My leave requests"
            className="min-w-full divide-y divide-slate-200 text-left text-sm"
          >
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2.5">
                  Leave Type
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Dates
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Calendar Span
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Submitted ({BUSINESS_TIMEZONE})
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Review Details
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {requests.map((request) => {
                const isPending = request.status === 'Pending'
                const isBusy = busyRequestId === request.id
                const isConfirming = confirmCancelId === request.id

                return (
                  <tr key={request.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">
                        {request.leaveType}
                      </div>
                      {request.reason && (
                        <div className="mt-0.5 max-w-xs text-xs text-slate-600">
                          {request.reason}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-800">
                      {request.startDate} to {request.endDate}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {request.calendarDays} day
                      {request.calendarDays === 1 ? '' : 's'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className={getLeaveStatusBadgeClasses(request.status)}>
                        {request.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                      {formatDateTimeInBusinessZone(
                        request.submittedAtUtc,
                        BUSINESS_TIMEZONE,
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {request.reviewedByName ? (
                        <div>
                          <div className="font-medium text-slate-800">
                            {request.status} by {request.reviewedByName} (
                            {request.reviewedByRole})
                          </div>
                          {request.reviewerNote && (
                            <div className="mt-0.5 text-slate-600">
                              Note: {request.reviewerNote}
                            </div>
                          )}
                        </div>
                      ) : request.status === 'Cancelled' ? (
                        <span>Cancelled by requester</span>
                      ) : (
                        <span>Awaiting review</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {isPending ? (
                        isConfirming ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleConfirmCancel(request.id)}
                              className="rounded-md bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-red-600"
                            >
                              {isBusy ? 'Cancelling...' : 'Confirm Cancel'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmCancelId(null)}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busyRequestId !== null}
                            onClick={() => setConfirmCancelId(request.id)}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            Cancel
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
