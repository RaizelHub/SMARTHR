import {
  BUSINESS_TIMEZONE,
  type AttendanceRecord,
  type AttendanceStatus,
} from '../../../types/attendance'
import {
  formatShiftDuration,
  formatTimeInBusinessZone,
  getBusinessDateString,
  isOvernightShift,
} from '../utils/timeZone'

interface AttendanceHistoryTableProps {
  records: readonly AttendanceRecord[]
  isLoading: boolean
  loadError: string | null
  isHrOversightView: boolean
  actingEmployeeLabel: string | null
  isActionBusy?: boolean
  onRetryLoad: () => void
  onClearDemoRecords: () => void
}

function getStatusBadgeClasses(status: AttendanceStatus): string {
  const base =
    'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium'
  return status === 'Clocked In'
    ? `${base} border-emerald-200 bg-emerald-50 text-emerald-800`
    : `${base} border-slate-300 bg-slate-100 text-slate-700`
}

export default function AttendanceHistoryTable({
  records,
  isLoading,
  loadError,
  isHrOversightView,
  actingEmployeeLabel,
  isActionBusy = false,
  onRetryLoad,
  onClearDemoRecords,
}: AttendanceHistoryTableProps) {
  return (
    <section
      aria-labelledby="attendance-history-heading"
      className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              id="attendance-history-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Attendance History
            </h2>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {records.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {isHrOversightView
              ? 'HR directory scope: viewing attendance records across all registered employees.'
              : actingEmployeeLabel
                ? `Personal scope: showing only attendance records for ${actingEmployeeLabel}.`
                : 'Select an employee session above to inspect attendance records.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClearDemoRecords}
          disabled={isLoading || isActionBusy || records.length === 0}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          Clear Demo Attendance
        </button>
      </div>

      {isLoading && (
        <div
          aria-busy="true"
          className="py-10 text-center text-sm text-slate-600"
        >
          Loading attendance history...
        </div>
      )}

      {!isLoading && loadError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-medium">Unable to load attendance records</p>
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

      {!isLoading && !loadError && records.length === 0 && (
        <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-800">
            No attendance records recorded yet
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Use the Clock In control above to start your first work session.
          </p>
        </div>
      )}

      {!isLoading && !loadError && records.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table
            aria-label="Attendance history"
            className="min-w-full divide-y divide-slate-200 text-left text-sm"
          >
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2.5">
                  Employee
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Attendance Date
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Clock-In ({BUSINESS_TIMEZONE})
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Clock-Out ({BUSINESS_TIMEZONE})
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Duration
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {records.map((record) => {
                const overnight = isOvernightShift(
                  record.clockInAtUtc,
                  record.clockOutAtUtc,
                  BUSINESS_TIMEZONE,
                )
                const clockOutBusinessDate = record.clockOutAtUtc
                  ? getBusinessDateString(
                      record.clockOutAtUtc,
                      BUSINESS_TIMEZONE,
                    )
                  : null

                return (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="font-medium text-slate-900">
                        {record.employeeName}
                      </div>
                      <div className="font-mono text-xs text-slate-500">
                        {record.employeeId}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-800">
                      {record.attendanceDate}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {formatTimeInBusinessZone(
                        record.clockInAtUtc,
                        BUSINESS_TIMEZONE,
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {record.clockOutAtUtc ? (
                        <div>
                          <span>
                            {formatTimeInBusinessZone(
                              record.clockOutAtUtc,
                              BUSINESS_TIMEZONE,
                            )}
                          </span>
                          {overnight && clockOutBusinessDate && (
                            <span className="ml-2 inline-flex items-center rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-800">
                              Next day ({clockOutBusinessDate})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {formatShiftDuration(
                        record.durationMinutes,
                        record.clockInAtUtc,
                        record.clockOutAtUtc,
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className={getStatusBadgeClasses(record.status)}>
                        {record.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
        Timestamps are stored in UTC and displayed in {BUSINESS_TIMEZONE}.
        Recorded durations represent raw elapsed shift time only and are not
        calculated as official payable hours.
      </p>
    </section>
  )
}

