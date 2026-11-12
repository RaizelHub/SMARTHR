import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import type {
  AttendanceAnalyticsSummary,
  CsvExportDataset,
} from '../../../types/report'
import {
  formatShiftDuration,
  formatTimeInBusinessZone,
  getBusinessDateString,
} from '../../attendance/utils/timeZone'
import PaginationControls from './PaginationControls'

const ATTENDANCE_PAGE_SIZE = 10

interface AttendanceAnalyticsSectionProps {
  data: AttendanceAnalyticsSummary
  canExport: boolean
  exportingDataset: CsvExportDataset | null
  page: number
  onPageChange: (page: number) => void
  onExportCsv: () => void
}

export default function AttendanceAnalyticsSection({
  data,
  canExport,
  exportingDataset,
  page,
  onPageChange,
  onExportCsv,
}: AttendanceAnalyticsSectionProps) {
  const totalPages = Math.max(
    1,
    Math.ceil(data.records.length / ATTENDANCE_PAGE_SIZE),
  )
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageStart = (safePage - 1) * ATTENDANCE_PAGE_SIZE
  const visibleRecords = data.records.slice(
    pageStart,
    pageStart + ATTENDANCE_PAGE_SIZE,
  )

  const maxDailySessions = Math.max(
    1,
    ...data.dailyTrends.map((day) => day.sessionCount),
  )

  return (
    <section
      aria-labelledby="attendance-analytics-heading"
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2
            id="attendance-analytics-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Attendance Analytics
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Session completion, overnight shift visibility, and raw elapsed
            shift durations in {BUSINESS_TIMEZONE}.
          </p>
        </div>

        {canExport && (
          <button
            type="button"
            onClick={onExportCsv}
            disabled={exportingDataset !== null || data.records.length === 0}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {exportingDataset === 'attendance'
              ? 'Exporting...'
              : 'Export Attendance CSV'}
          </button>
        )}
      </div>

      <div
        role="note"
        className="rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700"
      >
        <span className="font-semibold text-slate-900">
          Attendance Policy Notice:
        </span>{' '}
        Absence, late/tardiness, and payable overtime policies are not
        configured. Duration totals represent raw elapsed time from completed
        sessions only, and overnight shifts are counted once on their clock-in
        date ({BUSINESS_TIMEZONE}).
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Attendance Sessions
          </div>
          <div
            data-testid="kpi-total-sessions"
            className="mt-1 text-2xl font-semibold text-slate-900"
          >
            {data.totalSessions}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Completed: {data.completedSessions}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Missing Clock-Out
          </div>
          <div
            data-testid="kpi-missing-clockout"
            className="mt-1 text-2xl font-semibold text-amber-700"
          >
            {data.missingClockOutCount}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Active Clocked In sessions
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Overnight Shifts
          </div>
          <div
            data-testid="kpi-overnight-shifts"
            className="mt-1 text-2xl font-semibold text-sky-700"
          >
            {data.overnightSessionsCount}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Counted once by clock-in date
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Raw Recorded Duration
          </div>
          <div
            data-testid="kpi-recorded-duration"
            className="mt-1 text-2xl font-semibold text-slate-900"
          >
            {formatShiftDuration(data.totalRecordedMinutes)}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {data.averageRecordedMinutes !== null
              ? `Avg per completed session: ${formatShiftDuration(data.averageRecordedMinutes)}`
              : 'No completed sessions in range'}
          </div>
        </div>
      </div>

      {data.leaveOverlaps.length > 0 && (
        <div
          role="note"
          aria-label="Attendance and approved leave overlaps"
          className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"
        >
          <p className="font-semibold">
            Attendance Recorded on Approved Leave Dates ({data.leaveOverlaps.length})
          </p>
          <p className="mt-0.5 text-amber-800">
            These employees have attendance sessions dated inside an Approved
            leave span. Reported factually for manual HR reconciliation:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {data.leaveOverlaps.map((item) => (
              <li key={`${item.attendanceRecordId}-${item.leaveRequestId}`}>
                {item.employeeName} ({item.employeeId}, {item.department})
                clocked in on {item.attendanceDate} during Approved{' '}
                {item.leaveType} ({item.leaveStartDate} to {item.leaveEndDate}).
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Daily Shift Volume
          </h3>
          {data.dailyTrends.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No attendance sessions recorded for the selected filters.
            </p>
          ) : (
            <div className="mt-3 space-y-3" aria-label="Daily attendance trend chart">
              {data.dailyTrends.map((day) => {
                const widthPercent = Math.round(
                  (day.sessionCount / maxDailySessions) * 100,
                )
                return (
                  <div key={day.attendanceDate} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-medium text-slate-800">
                        {day.attendanceDate}
                      </span>
                      <span className="text-slate-600">
                        {day.sessionCount} session
                        {day.sessionCount === 1 ? '' : 's'} ·{' '}
                        {formatShiftDuration(day.totalRecordedMinutes)}
                        {day.missingClockOutCount > 0
                          ? ` · ${day.missingClockOutCount} open`
                          : ''}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-700"
                        style={{ width: `${widthPercent}%` }}
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
            Attendance by Department
          </h3>
          {data.byDepartment.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No departmental attendance sessions match the current filters.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table
                aria-label="Attendance by department"
                className="min-w-full divide-y divide-slate-200 text-left text-xs"
              >
                <thead className="bg-slate-50 font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="px-2.5 py-2">
                      Department
                    </th>
                    <th scope="col" className="px-2.5 py-2">
                      Sessions
                    </th>
                    <th scope="col" className="px-2.5 py-2">
                      Open
                    </th>
                    <th scope="col" className="px-2.5 py-2">
                      Raw Duration
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.byDepartment.map((dept) => (
                    <tr key={dept.department}>
                      <td className="px-2.5 py-2 font-medium text-slate-900">
                        {dept.department}
                      </td>
                      <td className="px-2.5 py-2 text-slate-700">
                        {dept.sessionCount}
                      </td>
                      <td className="px-2.5 py-2 text-slate-700">
                        {dept.missingClockOutCount}
                      </td>
                      <td className="px-2.5 py-2 text-slate-700">
                        {formatShiftDuration(dept.totalRecordedMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {data.records.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            No matching attendance sessions
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Widen your date range or clear filters to inspect recorded attendance
            history.
          </p>
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto">
            <table
              aria-label="Attendance report records"
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
                    Shift Date
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Clock-In ({BUSINESS_TIMEZONE})
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Clock-Out ({BUSINESS_TIMEZONE})
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Raw Duration
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {visibleRecords.map((rec) => {
                  const clockOutDate = rec.clockOutAtUtc
                    ? getBusinessDateString(rec.clockOutAtUtc, BUSINESS_TIMEZONE)
                    : null
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <div className="font-medium text-slate-900">
                          {rec.employeeName}
                        </div>
                        <div className="font-mono text-xs text-slate-500">
                          {rec.employeeId}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                        {rec.department}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-medium text-slate-800">
                        {rec.attendanceDate}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                        {formatTimeInBusinessZone(
                          rec.clockInAtUtc,
                          BUSINESS_TIMEZONE,
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                        {rec.clockOutAtUtc ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>
                              {formatTimeInBusinessZone(
                                rec.clockOutAtUtc,
                                BUSINESS_TIMEZONE,
                              )}
                            </span>
                            {rec.isOvernight && clockOutDate && (
                              <span className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-800">
                                Overnight ({clockOutDate})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-amber-700">
                            Missing clock-out
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                        {formatShiftDuration(
                          rec.durationMinutes,
                          rec.clockInAtUtc,
                          rec.clockOutAtUtc,
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={
                            rec.status === 'Clocked In'
                              ? 'inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800'
                              : 'inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700'
                          }
                        >
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <PaginationControls
            label="attendance"
            currentPage={safePage}
            totalItems={data.records.length}
            pageSize={ATTENDANCE_PAGE_SIZE}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </section>
  )
}

