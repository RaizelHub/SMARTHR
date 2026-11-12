import type { Employee, EmploymentStatus } from '../../../types/employee'

interface EmployeeRosterTableProps {
  employees: readonly Employee[]
  isLoading: boolean
  loadError: string | null
  onRetryLoad: () => void
  onClearAll?: () => void
  onResetDemo?: () => void
  isActionBusy?: boolean
  canManageDestructiveActions?: boolean
  scopeDescription?: string
}

function getStatusBadgeClasses(status: EmploymentStatus): string {
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

export default function EmployeeRosterTable({
  employees,
  isLoading,
  loadError,
  onRetryLoad,
  onClearAll,
  onResetDemo,
  isActionBusy = false,
  canManageDestructiveActions = false,
  scopeDescription = 'Showing employee records permitted for your role.',
}: EmployeeRosterTableProps) {
  return (
    <section
      aria-labelledby="employee-roster-heading"
      className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              id="employee-roster-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Registered Employees
            </h2>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {employees.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{scopeDescription}</p>
        </div>

        {canManageDestructiveActions && onResetDemo && onClearAll && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onResetDemo}
              disabled={isLoading || isActionBusy}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              Reset Demo Data
            </button>
            <button
              type="button"
              onClick={onClearAll}
              disabled={isLoading || isActionBusy || employees.length === 0}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {isLoading && (
        <div
          aria-busy="true"
          className="py-10 text-center text-sm text-slate-600"
        >
          Loading employee records...
        </div>
      )}

      {!isLoading && loadError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-medium">Unable to load employee records</p>
          <p className="mt-1">{loadError}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetryLoad}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              Retry
            </button>
            {canManageDestructiveActions && onResetDemo && (
              <button
                type="button"
                onClick={onResetDemo}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                Reset Demo Data
              </button>
            )}
          </div>
        </div>
      )}

      {!isLoading && !loadError && employees.length === 0 && (
        <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-800">
            No employees registered yet
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Complete the Register New Employee form above to add a record, or
            restore synthetic sample employees using Reset Demo Data.
          </p>
        </div>
      )}

      {!isLoading && !loadError && employees.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table
            aria-label="Registered employees"
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
                  Work Email
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
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-medium text-slate-900">
                    {employee.employeeId}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">
                    {employee.fullName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                    {employee.workEmail}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {employee.department}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {employee.position}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className={getStatusBadgeClasses(employee.employmentStatus)}>
                      {employee.employmentStatus}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                    {employee.hireDate}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                    {employee.assignedRole}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

