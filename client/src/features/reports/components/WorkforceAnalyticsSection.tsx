import type { EmploymentStatus } from '../../../types/employee'
import type {
  CsvExportDataset,
  EmployeeAnalyticsSummary,
} from '../../../types/report'
import PaginationControls from './PaginationControls'

const WORKFORCE_PAGE_SIZE = 10

interface WorkforceAnalyticsSectionProps {
  data: EmployeeAnalyticsSummary
  canExport: boolean
  exportingDataset: CsvExportDataset | null
  page: number
  onPageChange: (page: number) => void
  onExportCsv: () => void
}

function getEmploymentStatusBadgeClasses(status: EmploymentStatus): string {
  const base =
    'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium'
  switch (status) {
    case 'Active':
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-800`
    case 'Probation':
      return `${base} border-amber-200 bg-amber-50 text-amber-800`
    case 'On Leave':
      return `${base} border-sky-200 bg-sky-50 text-sky-800`
    case 'Inactive':
      return `${base} border-slate-300 bg-slate-100 text-slate-700`
  }
}

function getStatusBarColor(status: EmploymentStatus): string {
  switch (status) {
    case 'Active':
      return 'bg-emerald-600'
    case 'Probation':
      return 'bg-amber-500'
    case 'On Leave':
      return 'bg-sky-600'
    case 'Inactive':
      return 'bg-slate-500'
  }
}

export default function WorkforceAnalyticsSection({
  data,
  canExport,
  exportingDataset,
  page,
  onPageChange,
  onExportCsv,
}: WorkforceAnalyticsSectionProps) {
  const totalPages = Math.max(
    1,
    Math.ceil(data.employees.length / WORKFORCE_PAGE_SIZE),
  )
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageStart = (safePage - 1) * WORKFORCE_PAGE_SIZE
  const visibleEmployees = data.employees.slice(
    pageStart,
    pageStart + WORKFORCE_PAGE_SIZE,
  )

  return (
    <section
      aria-labelledby="workforce-analytics-heading"
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2
            id="workforce-analytics-heading"
            className="text-lg font-semibold text-slate-900"
          >
            Workforce &amp; Department Analytics
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Filtered directory headcount, hiring counts, and departmental
            composition within your authorized scope.
          </p>
        </div>

        {canExport && (
          <button
            type="button"
            onClick={onExportCsv}
            disabled={exportingDataset !== null || data.employees.length === 0}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {exportingDataset === 'employees'
              ? 'Exporting...'
              : 'Export Workforce CSV'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Employees
          </div>
          <div
            data-testid="kpi-total-employees"
            className="mt-1 text-2xl font-semibold text-slate-900"
          >
            {data.totalEmployees}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Matching active filters
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Active Headcount
          </div>
          <div
            data-testid="kpi-active-employees"
            className="mt-1 text-2xl font-semibold text-emerald-700"
          >
            {data.activeEmployees}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Active employment status
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Non-Active / Transitional
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {data.probationEmployees +
              data.onLeaveStatusEmployees +
              data.inactiveEmployees}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {data.probationEmployees} Probation · {data.onLeaveStatusEmployees}{' '}
            On Leave · {data.inactiveEmployees} Inactive
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            New Hires in Period
          </div>
          <div
            data-testid="kpi-new-hires"
            className="mt-1 text-2xl font-semibold text-blue-700"
          >
            {data.newHiresInPeriod}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Based on hire date in range
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Headcount by Department
          </h3>
          {data.byDepartment.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No department headcount records match the current filters.
            </p>
          ) : (
            <div className="mt-3 space-y-3" aria-label="Department headcount chart">
              {data.byDepartment.map((dept) => {
                const percent =
                  data.totalEmployees > 0
                    ? Math.round((dept.totalCount / data.totalEmployees) * 100)
                    : 0
                return (
                  <div key={dept.department} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">
                        {dept.department}
                      </span>
                      <span className="text-slate-600">
                        {dept.totalCount} ({percent}%) · Active:{' '}
                        {dept.activeCount}, Hires: {dept.newHiresCount}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-600"
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
            Employment Status Distribution
          </h3>
          {data.totalEmployees === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No employees match the current filters.
            </p>
          ) : (
            <div className="mt-3 space-y-3" aria-label="Employment status chart">
              {data.byEmploymentStatus.map((item) => {
                const percent =
                  data.totalEmployees > 0
                    ? Math.round((item.count / data.totalEmployees) * 100)
                    : 0
                return (
                  <div key={item.status} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">
                        {item.status}
                      </span>
                      <span className="text-slate-600">
                        {item.count} ({percent}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${getStatusBarColor(item.status)}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {data.employees.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            No matching employee directory records
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Adjust Department, Employee, or Employment Status filters to view
            matching personnel.
          </p>
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto">
            <table
              aria-label="Workforce analytics breakdown"
              className="min-w-full divide-y divide-slate-200 text-left text-sm"
            >
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-2.5">
                    Employee ID
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Full Name
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Department
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Position
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Hire Date
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {visibleEmployees.map((emp) => (
                  <tr key={emp.employeeId} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-medium text-slate-900">
                      {emp.employeeId}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                      {emp.fullName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                      {emp.department}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                      {emp.position}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={getEmploymentStatusBadgeClasses(
                          emp.employmentStatus,
                        )}
                      >
                        {emp.employmentStatus}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {emp.hireDate}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                      {emp.assignedRole}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            label="workforce"
            currentPage={safePage}
            totalItems={data.employees.length}
            pageSize={WORKFORCE_PAGE_SIZE}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </section>
  )
}

