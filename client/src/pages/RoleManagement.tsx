import { useCallback, useEffect, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import { formatDateTimeInBusinessZone } from '../features/attendance/utils/timeZone'
import { useAuth } from '../features/auth/authContextStore'
import { ROLE_PERMISSIONS } from '../features/auth/permissions'
import type { SecurityAuditEntry } from '../features/auth/securityAudit'
import {
  employeeService as defaultEmployeeService,
  type EmployeeService,
} from '../features/employees/services/employeeService'
import { BUSINESS_TIMEZONE } from '../types/attendance'
import {
  ASSIGNED_ROLES,
  type AssignedRole,
  type Employee,
} from '../types/employee'

interface RoleManagementPageProps {
  service?: EmployeeService
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

function getAuditBadgeClasses(eventType: SecurityAuditEntry['eventType']): string {
  const base =
    'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium'
  switch (eventType) {
    case 'ROLE_CHANGED':
      return `${base} border-blue-200 bg-blue-50 text-blue-800`
    case 'ROLE_CHANGE_DENIED':
      return `${base} border-red-200 bg-red-50 text-red-800`
    case 'DIRECTORY_CLEARED':
    case 'DIRECTORY_RESET':
      return `${base} border-amber-200 bg-amber-50 text-amber-800`
  }
}

export default function RoleManagement({
  service = defaultEmployeeService,
}: RoleManagementPageProps) {
  const auth = useAuth()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [auditEvents, setAuditEvents] = useState<SecurityAuditEntry[]>([])
  const [draftRoles, setDraftRoles] = useState<Record<string, AssignedRole>>({})
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [busyEmployeeId, setBusyEmployeeId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const actorEmployeeId = auth.actorContext.actorEmployeeId
  const sessionExpiresAtUtc = auth.actorContext.sessionExpiresAtUtc

  const fetchAdminData = useCallback(async () => {
    const actor = { actorEmployeeId, sessionExpiresAtUtc }
    const [loadedEmployees, loadedAudit] = await Promise.all([
      service.listEmployees(actor),
      service.listSecurityAuditEvents(actor),
    ])
    return { loadedEmployees, loadedAudit }
  }, [actorEmployeeId, sessionExpiresAtUtc, service])

  useEffect(() => {
    let cancelled = false

    fetchAdminData()
      .then(({ loadedEmployees, loadedAudit }) => {
        if (!cancelled) {
          setEmployees(loadedEmployees)
          setAuditEvents(loadedAudit)
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            getErrorMessage(error, 'Failed to load role administration data.'),
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
  }, [fetchAdminData])

  const handleRetry = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setActionError(null)
    try {
      const { loadedEmployees, loadedAudit } = await fetchAdminData()
      setEmployees(loadedEmployees)
      setAuditEvents(loadedAudit)
    } catch (error: unknown) {
      setLoadError(
        getErrorMessage(error, 'Failed to load role administration data.'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [fetchAdminData])

  const handleRoleUpdate = useCallback(
    async (employee: Employee) => {
      const nextRole = draftRoles[employee.employeeId] ?? employee.assignedRole
      if (nextRole === employee.assignedRole) {
        return
      }

      setBusyEmployeeId(employee.employeeId)
      setActionError(null)
      setActionSuccess(null)

      try {
        const actor = { actorEmployeeId, sessionExpiresAtUtc }
        const updated = await service.updateEmployeeRole(
          {
            targetEmployeeId: employee.employeeId,
            newRole: nextRole,
          },
          actor,
        )

        const refreshedAudit = await service.listSecurityAuditEvents(actor)
        setEmployees((prev) =>
          prev.map((item) =>
            item.employeeId === updated.employeeId ? updated : item,
          ),
        )
        setAuditEvents(refreshedAudit)
        setDraftRoles((prev) => {
          const next = { ...prev }
          delete next[employee.employeeId]
          return next
        })
        setActionSuccess(
          `Updated ${updated.fullName} (${updated.employeeId}) from ${employee.assignedRole} to ${updated.assignedRole}.`,
        )

        await auth.refreshSession()
      } catch (error: unknown) {
        setActionError(
          getErrorMessage(error, 'Failed to update employee role assignment.'),
        )
      } finally {
        setBusyEmployeeId(null)
      }
    },
    [actorEmployeeId, auth, draftRoles, service, sessionExpiresAtUtc],
  )

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Access Control &amp; Role Administration
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage RBAC role assignments and inspect security audit events.
            Restricted to HR Admin accounts.
          </p>
        </div>

        {service.isDemoMode && (
          <div
            role="note"
            className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span className="font-medium">Demo RBAC Mode:</span> Role assignments
            and audit entries are persisted locally in browser{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
              localStorage
            </code>
            . Production systems must verify authorization server-side via JWT
            or session middleware before database writes.
          </div>
        )}

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

        <section
          aria-labelledby="role-assignments-heading"
          className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
        >
          <div className="border-b border-slate-200 pb-4">
            <h2
              id="role-assignments-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Employee Role Assignments
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              At least one active HR Admin account must remain assigned at all
              times.
            </p>
          </div>

          {isLoading ? (
            <div
              aria-busy="true"
              className="py-10 text-center text-sm text-slate-600"
            >
              Loading employee roles...
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              <p className="font-medium">Unable to load role assignments</p>
              <p className="mt-1">{loadError}</p>
              <button
                type="button"
                onClick={() => void handleRetry()}
                className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table
                aria-label="Employee role assignments"
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
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Current Role
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Assign Role
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {employees.map((employee) => {
                    const pendingRole =
                      draftRoles[employee.employeeId] ?? employee.assignedRole
                    const isBusy = busyEmployeeId === employee.employeeId
                    const unchanged = pendingRole === employee.assignedRole

                    return (
                      <tr key={employee.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-3">
                          <div className="font-medium text-slate-900">
                            {employee.fullName}
                          </div>
                          <div className="font-mono text-xs text-slate-500">
                            {employee.employeeId}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                          {employee.department}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                          {employee.employmentStatus}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-800">
                          {employee.assignedRole}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <select
                            aria-label={`Role for ${employee.employeeId}`}
                            value={pendingRole}
                            disabled={busyEmployeeId !== null}
                            onChange={(event) =>
                              setDraftRoles((prev) => ({
                                ...prev,
                                [employee.employeeId]: event.target
                                  .value as AssignedRole,
                              }))
                            }
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            {ASSIGNED_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <button
                            type="button"
                            disabled={
                              unchanged || busyEmployeeId !== null
                            }
                            onClick={() => void handleRoleUpdate(employee)}
                            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            {isBusy ? 'Saving...' : 'Update Role'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="permission-matrix-heading"
          className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
        >
          <div className="border-b border-slate-200 pb-4">
            <h2
              id="permission-matrix-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Centralized Permission Matrix
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Permissions granted to each Smart HR role (default-deny for
              unlisted capabilities).
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {ASSIGNED_ROLES.map((role) => (
              <div
                key={role}
                className="rounded-md border border-slate-200 bg-slate-50 p-4"
              >
                <h3 className="text-sm font-semibold text-slate-900">{role}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ROLE_PERMISSIONS[role].map((permission) => (
                    <code
                      key={permission}
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
                    >
                      {permission}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="security-audit-heading"
          className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
        >
          <div className="border-b border-slate-200 pb-4">
            <h2
              id="security-audit-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Security Audit Log
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Records authorization denials, role changes, and administrative
              directory resets in demo storage.
            </p>
          </div>

          {auditEvents.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              No security audit events recorded yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table
                aria-label="Security audit events"
                className="min-w-full divide-y divide-slate-200 text-left text-sm"
              >
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">
                      Timestamp ({BUSINESS_TIMEZONE})
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Event
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Actor
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Target
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Summary
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {auditEvents.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                        {formatDateTimeInBusinessZone(
                          entry.timestampUtc,
                          BUSINESS_TIMEZONE,
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className={getAuditBadgeClasses(entry.eventType)}>
                          {entry.eventType}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-700">
                        <span className="font-mono">{entry.actorEmployeeId}</span>{' '}
                        ({entry.actorRole})
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-700">
                        {entry.targetEmployeeId ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">
                        {entry.summary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  )
}

