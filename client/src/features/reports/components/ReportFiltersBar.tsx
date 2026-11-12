import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import {
  EMPLOYMENT_STATUSES,
  type Department,
  type EmploymentStatus,
} from '../../../types/employee'
import {
  LEAVE_REQUEST_STATUSES,
  type LeaveRequestStatus,
} from '../../../types/leave'
import type {
  AuthorizedReportScope,
  ReportFilterInput,
  ScopedEmployeeFilterOption,
} from '../../../types/report'
import { getBusinessDateString } from '../../attendance/utils/timeZone'

interface ReportFiltersBarProps {
  filters: Required<ReportFilterInput>
  authorizedScope: AuthorizedReportScope
  availableDepartments: readonly Department[]
  availableEmployees: readonly ScopedEmployeeFilterOption[]
  isLoading: boolean
  filterValidationError: string | null
  onFiltersChange: (nextFilters: Required<ReportFilterInput>) => void
  onResetFilters: () => void
}

function addUtcDaysToIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ReportFiltersBar({
  filters,
  authorizedScope,
  availableDepartments,
  availableEmployees,
  isLoading,
  filterValidationError,
  onFiltersChange,
  onResetFilters,
}: ReportFiltersBarProps) {
  const isDepartmentLocked = authorizedScope !== 'all'

  function applyPresetAllDates() {
    onFiltersChange({
      ...filters,
      startDate: '',
      endDate: '',
    })
  }

  function applyPresetCurrentMonth() {
    const todayIso = getBusinessDateString(
      new Date().toISOString(),
      BUSINESS_TIMEZONE,
    )
    const monthStart = `${todayIso.slice(0, 7)}-01`
    onFiltersChange({
      ...filters,
      startDate: monthStart,
      endDate: todayIso,
    })
  }

  function applyPresetLast30Days() {
    const todayIso = getBusinessDateString(
      new Date().toISOString(),
      BUSINESS_TIMEZONE,
    )
    const thirtyDaysAgo = addUtcDaysToIsoDate(todayIso, -29)
    onFiltersChange({
      ...filters,
      startDate: thirtyDaysAgo,
      endDate: todayIso,
    })
  }

  const activeFilterPills: string[] = []
  if (filters.startDate) {
    activeFilterPills.push(`From: ${filters.startDate}`)
  }
  if (filters.endDate) {
    activeFilterPills.push(`To: ${filters.endDate}`)
  }
  if (filters.department !== 'All') {
    activeFilterPills.push(`Department: ${filters.department}`)
  }
  if (filters.employeeId !== 'All') {
    const emp = availableEmployees.find(
      (item) => item.employeeId === filters.employeeId,
    )
    activeFilterPills.push(
      `Employee: ${emp ? `${emp.fullName} (${emp.employeeId})` : filters.employeeId}`,
    )
  }
  if (filters.employmentStatus !== 'All') {
    activeFilterPills.push(`Employment: ${filters.employmentStatus}`)
  }
  if (filters.leaveStatus !== 'All') {
    activeFilterPills.push(`Leave Status: ${filters.leaveStatus}`)
  }

  return (
    <section
      aria-labelledby="report-filters-heading"
      className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2
            id="report-filters-heading"
            className="text-base font-semibold text-slate-900"
          >
            Report Filters
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Date boundaries are evaluated inclusively in {BUSINESS_TIMEZONE}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={applyPresetAllDates}
            disabled={isLoading}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            All Recorded Dates
          </button>
          <button
            type="button"
            onClick={applyPresetCurrentMonth}
            disabled={isLoading}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Current Month
          </button>
          <button
            type="button"
            onClick={applyPresetLast30Days}
            disabled={isLoading}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={onResetFilters}
            disabled={isLoading || activeFilterPills.length === 0}
            className="rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {filterValidationError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
        >
          {filterValidationError}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label
            htmlFor="report-filter-start-date"
            className="block text-xs font-medium text-slate-700"
          >
            Start Date
          </label>
          <input
            id="report-filter-start-date"
            type="date"
            value={filters.startDate}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                startDate: event.target.value,
              })
            }
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div>
          <label
            htmlFor="report-filter-end-date"
            className="block text-xs font-medium text-slate-700"
          >
            End Date
          </label>
          <input
            id="report-filter-end-date"
            type="date"
            value={filters.endDate}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                endDate: event.target.value,
              })
            }
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div>
          <label
            htmlFor="report-filter-department"
            className="block text-xs font-medium text-slate-700"
          >
            Department
          </label>
          <select
            id="report-filter-department"
            value={filters.department}
            disabled={isDepartmentLocked}
            onChange={(event) => {
              const nextDept = event.target.value as Department | 'All'
              const selectedEmp = availableEmployees.find(
                (item) => item.employeeId === filters.employeeId,
              )
              const keepEmployee =
                nextDept === 'All' ||
                !selectedEmp ||
                selectedEmp.department === nextDept
              onFiltersChange({
                ...filters,
                department: nextDept,
                employeeId: keepEmployee ? filters.employeeId : 'All',
              })
            }}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            {authorizedScope === 'all' ? (
              <option value="All">All Departments</option>
            ) : (
              <option value="All">
                My Authorized Department ({availableDepartments[0] ?? 'Scoped'})
              </option>
            )}
            {availableDepartments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="report-filter-employee"
            className="block text-xs font-medium text-slate-700"
          >
            Employee
          </label>
          <select
            id="report-filter-employee"
            value={filters.employeeId}
            disabled={authorizedScope === 'own'}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                employeeId: event.target.value,
              })
            }
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="All">
              {authorizedScope === 'own'
                ? 'My Record Only'
                : 'All Authorized Employees'}
            </option>
            {availableEmployees
              .filter(
                (emp) =>
                  filters.department === 'All' ||
                  emp.department === filters.department,
              )
              .map((emp) => (
                <option key={emp.employeeId} value={emp.employeeId}>
                  {emp.fullName} ({emp.employeeId})
                </option>
              ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="report-filter-employment-status"
            className="block text-xs font-medium text-slate-700"
          >
            Employment Status
          </label>
          <select
            id="report-filter-employment-status"
            value={filters.employmentStatus}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                employmentStatus: event.target.value as EmploymentStatus | 'All',
              })
            }
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="All">All Employment Statuses</option>
            {EMPLOYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="report-filter-leave-status"
            className="block text-xs font-medium text-slate-700"
          >
            Leave Status
          </label>
          <select
            id="report-filter-leave-status"
            value={filters.leaveStatus}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                leaveStatus: event.target.value as LeaveRequestStatus | 'All',
              })
            }
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="All">All Leave Statuses</option>
            {LEAVE_REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeFilterPills.length > 0 && (
        <div
          aria-label="Active filters"
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3"
        >
          <span className="text-xs font-medium text-slate-500">
            Active Filters:
          </span>
          {activeFilterPills.map((pill) => (
            <span
              key={pill}
              className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800"
            >
              {pill}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

