import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import type {
  CsvExportDataset,
  LeaveAnalyticsSummary,
} from '../../../types/report'
import { formatDateTimeInBusinessZone } from '../../attendance/utils/timeZone'
import { getLeaveStatusBadgeClasses } from '../../leave/utils/leaveStatusBadge'
import PaginationControls from './PaginationControls'

const LEAVE_PAGE_SIZE = 10

interface LeaveAnalyticsSectionProps {
  data: LeaveAnalyticsSummary
  canExport: boolean
  exportingDataset: CsvExportDataset | null
  page: number
  onPageChange: (page: number) => void
  onExportCsv: () => void
}

export default function LeaveAnalyticsSection({
  data,
  canExport,
  exportingDataset,
  page,
  onPageChange,
  onExportCsv,
}: LeaveAnalyticsSectionProps) {
  const totalPages = Math.max(
    1,
    Math.ceil(data.requests.length / LEAVE_PAGE_SIZE),
  )
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageStart = (safePage - 1) * LEAVE_PAGE_SIZE
  const visibleRequests = data.requests.slice(
    pageStart,
    pageStart + LEAVE_PAGE_SIZE,
  )

  return (
    <section
      aria-labelledby="leave-analytics-heading"
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2
            id="leave-analytics-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Leave Management Insights
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Leave submission counts, separate decision outcomes, type mix, and
            monthly trends matching active filters.
          </p>
        </div>

        {canExport && (
          <button
            type="button"
            onClick={onExportCsv}
            disabled={exportingDataset !== null || data.requests.length === 0}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {exportingDataset === 'leave' ? 'Exporting...' : 'Export Leave CSV'}
          </button>
        )}
      </div>

      <div
        role="note"
        className="rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700"
      >
        <span className="font-semibold text-slate-900">
          Leave Balances Not Configured:
        </span>{' '}
        No company leave quota, statutory accrual, or holiday/weekend deduction
        policy is configured. Approved calendar days represent total inclusive
        calendar dates of Approved requests only.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Requests
          </div>
          <div
            data-testid="kpi-leave-total"
            className="mt-1 text-2xl font-semibold text-slate-900"
          >
            {data.totalRequests}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Pending Review
          </div>
          <div
            data-testid="kpi-leave-pending"
            className="mt-1 text-2xl font-semibold text-amber-700"
          >
            {data.pendingRequests}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Approved
          </div>
          <div
            data-testid="kpi-leave-approved"
            className="mt-1 text-2xl font-semibold text-emerald-700"
          >
            {data.approvedRequests}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {data.approvedCalendarDays} approved cal. day
            {data.approvedCalendarDays === 1 ? '' : 's'}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Rejected
          </div>
          <div
            data-testid="kpi-leave-rejected"
            className="mt-1 text-2xl font-semibold text-red-700"
          >
            {data.rejectedRequests}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Cancelled
          </div>
          <div
            data-testid="kpi-leave-cancelled"
            className="mt-1 text-2xl font-semibold text-slate-700"
          >
            {data.cancelledRequests}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Leave Breakdown by Type
          </h3>
          {data.byLeaveType.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No leave requests match the active filters.
            </p>
          ) : (
            <div className="mt-3 space-y-3" aria-label="Leave by type chart">
              {data.byLeaveType.map((item) => {
                const percent =
                  data.totalRequests > 0
                    ? Math.round((item.totalCount / data.totalRequests) * 100)
                    : 0
                return (
                  <div key={item.leaveType} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">
                        {item.leaveType}
                      </span>
                      <span className="text-slate-600">
                        {item.totalCount} ({percent}%) · Appr:{' '}
                        {item.approvedCount} ({item.approvedCalendarDays}d),
                        Canc: {item.cancelledCount}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Monthly Leave Trend &amp; Department Summary
          </h3>
          {data.monthlyTrends.length === 0 && data.byDepartment.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No monthly trend data matches the active filters.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {data.monthlyTrends.length > 0 && (
                <div className="overflow-x-auto">
                  <table
                    aria-label="Monthly leave trend"
                    className="min-w-full divide-y divide-slate-200 text-left text-xs"
                  >
                    <thead className="bg-slate-50 font-semibold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th scope="col" className="px-2.5 py-2">
                          Month
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Total
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Approved
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Pending
                        </th>
                        <th scope="col" className="px-2.5 py-2">
                          Rej / Canc
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.monthlyTrends.map((m) => (
                        <tr key={m.month}>
                          <td className="px-2.5 py-2 font-mono font-medium text-slate-900">
                            {m.month}
                          </td>
                          <td className="px-2.5 py-2 text-slate-700">
                            {m.totalCount}
                          </td>
                          <td className="px-2.5 py-2 text-emerald-700">
                            {m.approvedCount}
                          </td>
                          <td className="px-2.5 py-2 text-amber-700">
                            {m.pendingCount}
                          </td>
                          <td className="px-2.5 py-2 text-slate-600">
                            {m.rejectedCount} / {m.cancelledCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.byDepartment.length > 0 && (
                <div className="border-t border-slate-200 pt-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    By Department
                  </h4>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {data.byDepartment.map((dept) => (
                      <li
                        key={dept.department}
                        className="flex items-center justify-between"
                      >
                        <span className="font-medium text-slate-800">
                          {dept.department}
                        </span>
                        <span>
                          {dept.totalCount} req ({dept.approvedCalendarDays}{' '}
                          approved cal. days)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {data.requests.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            No matching leave requests
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Adjust date bounds, Leave Status, or Department filters to inspect
            matching requests.
          </p>
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto">
            <table
              aria-label="Leave report requests"
              className="min-w-full divide-y divide-slate-200 text-left text-sm"
            >
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2.5">
                    Employee
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Department
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Leave Type
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Dates
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Days
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Reviewer Role
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Submitted ({BUSINESS_TIMEZONE})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {visibleRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="font-medium text-slate-900">
                        {req.employeeName}
                      </div>
                      <div className="font-mono text-xs text-slate-500">
                        {req.employeeId}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                      {req.department}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800">
                      {req.leaveType}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                      {req.startDate} to {req.endDate}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                      {req.calendarDays}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className={getLeaveStatusBadgeClasses(req.status)}>
                        {req.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                      {req.reviewedByRole ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                      {formatDateTimeInBusinessZone(
                        req.submittedAtUtc,
                        BUSINESS_TIMEZONE,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            label="leave"
            currentPage={safePage}
            totalItems={data.requests.length}
            pageSize={LEAVE_PAGE_SIZE}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </section>
  )
}

