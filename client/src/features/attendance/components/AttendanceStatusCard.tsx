import { BUSINESS_TIMEZONE, type AttendanceRecord } from '../../../types/attendance'
import type { Employee } from '../../../types/employee'
import { formatDateTimeInBusinessZone } from '../utils/timeZone'

interface AttendanceStatusCardProps {
  employee: Employee | null
  activeSession: AttendanceRecord | null
  isLoading: boolean
  isSubmitting: boolean
  pendingAction: 'clock-in' | 'clock-out' | null
  actionError: string | null
  actionSuccess: string | null
  onClockIn: () => void
  onClockOut: () => void
  onDismissSuccess: () => void
}

export default function AttendanceStatusCard({
  employee,
  activeSession,
  isLoading,
  isSubmitting,
  pendingAction,
  actionError,
  actionSuccess,
  onClockIn,
  onClockOut,
  onDismissSuccess,
}: AttendanceStatusCardProps) {
  const isInactiveEmployee = employee?.employmentStatus === 'Inactive'
  const isClockedIn = Boolean(activeSession)
  const canClockIn =
    Boolean(employee) && !isInactiveEmployee && !isClockedIn && !isLoading && !isSubmitting
  const canClockOut =
    Boolean(employee) && isClockedIn && !isLoading && !isSubmitting

  return (
    <section
      aria-labelledby="attendance-status-heading"
      className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2
            id="attendance-status-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Current Work Session
          </h2>
          {employee ? (
            <p className="mt-1 text-sm text-slate-600">
              {employee.fullName} ({employee.employeeId}) · {employee.department} ·{' '}
              {employee.assignedRole}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              No active employee selected.
            </p>
          )}
        </div>

        <div>
          {isLoading ? (
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              Checking status...
            </span>
          ) : isClockedIn ? (
            <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
              Clocked In
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              Not Clocked In
            </span>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-medium">Attendance action failed</p>
          <p className="mt-0.5">{actionError}</p>
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          className="mt-4 flex items-start justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <div>
            <p className="font-medium">Attendance recorded</p>
            <p className="mt-0.5">{actionSuccess}</p>
          </div>
          <button
            type="button"
            onClick={onDismissSuccess}
            className="rounded px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {isInactiveEmployee && (
        <div
          role="note"
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          This employee has status <strong>Inactive</strong> and cannot start a
          new attendance session.
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Session State
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {isLoading
              ? 'Loading...'
              : activeSession
                ? 'Active shift in progress'
                : 'No active work session'}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Clock-In Start ({BUSINESS_TIMEZONE})
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {activeSession
              ? formatDateTimeInBusinessZone(activeSession.clockInAtUtc)
              : '—'}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Shift Business Date
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {activeSession ? activeSession.attendanceDate : '—'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onClockIn}
          disabled={!canClockIn}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1"
        >
          {pendingAction === 'clock-in' ? 'Clocking In...' : 'Clock In'}
        </button>

        <button
          type="button"
          onClick={onClockOut}
          disabled={!canClockOut}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1"
        >
          {pendingAction === 'clock-out' ? 'Clocking Out...' : 'Clock Out'}
        </button>
      </div>
    </section>
  )
}

