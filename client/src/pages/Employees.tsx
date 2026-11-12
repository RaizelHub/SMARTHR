import { useCallback, useEffect, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import { useAuth } from '../features/auth/authContextStore'
import EmployeeRegistrationForm from '../features/employees/components/EmployeeRegistrationForm'
import EmployeeRosterTable from '../features/employees/components/EmployeeRosterTable'
import {
  employeeService,
  type EmployeeService,
} from '../features/employees/services/employeeService'
import type { CreateEmployeeInput, Employee } from '../types/employee'

interface EmployeesPageProps {
  service?: EmployeeService
  focusRegistration?: boolean
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

export default function Employees({
  service = employeeService,
  focusRegistration = false,
}: EmployeesPageProps) {
  const auth = useAuth()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isActionBusy, setIsActionBusy] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const actorEmployeeId = auth.actorContext.actorEmployeeId
  const sessionExpiresAtUtc = auth.actorContext.sessionExpiresAtUtc
  const canCreate = auth.hasPermission('employees.create')
  const canDelete = auth.hasPermission('employees.delete')
  const canAssignHrAdmin = auth.hasPermission('roles.manage')
  const canReadAll = auth.hasPermission('employees.read_all')
  const canReadTeam = auth.hasPermission('employees.read_team')

  const scopeDescription = canReadAll
    ? 'Organization scope: viewing all registered employees stored in browser demo storage.'
    : canReadTeam
      ? `Department scope (${auth.currentUser?.department ?? ''}): viewing only employees in your department.`
      : 'Personal scope: viewing only your own employee profile.'

  useEffect(() => {
    let cancelled = false

    service
      .listEmployees({ actorEmployeeId, sessionExpiresAtUtc })
      .then((records) => {
        if (!cancelled) {
          setEmployees(records)
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            getErrorMessage(error, 'Failed to load employee records.'),
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
  }, [actorEmployeeId, sessionExpiresAtUtc, service])

  const handleRetryLoad = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setActionError(null)
    try {
      const records = await service.listEmployees({
        actorEmployeeId,
        sessionExpiresAtUtc,
      })
      setEmployees(records)
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error, 'Failed to load employee records.'))
    } finally {
      setIsLoading(false)
    }
  }, [actorEmployeeId, sessionExpiresAtUtc, service])

  const handleRegister = useCallback(
    async (input: CreateEmployeeInput): Promise<Employee> => {
      setActionError(null)
      const created = await service.createEmployee(input, {
        actorEmployeeId,
        sessionExpiresAtUtc,
      })
      setEmployees((previous) => [created, ...previous])
      return created
    },
    [actorEmployeeId, sessionExpiresAtUtc, service],
  )

  const handleClearAll = useCallback(async () => {
    setIsActionBusy(true)
    setActionError(null)
    try {
      const updated = await service.clearEmployees({
        actorEmployeeId,
        sessionExpiresAtUtc,
      })
      setEmployees(updated)
    } catch (error: unknown) {
      setActionError(
        getErrorMessage(error, 'Failed to clear demo employee records.'),
      )
    } finally {
      setIsActionBusy(false)
    }
  }, [actorEmployeeId, sessionExpiresAtUtc, service])

  const handleResetDemo = useCallback(async () => {
    setIsActionBusy(true)
    setActionError(null)
    setLoadError(null)
    try {
      const restored = await service.resetDemoEmployees({
        actorEmployeeId,
        sessionExpiresAtUtc,
      })
      setEmployees(restored)
    } catch (error: unknown) {
      setActionError(
        getErrorMessage(error, 'Failed to reset demo employee records.'),
      )
    } finally {
      setIsActionBusy(false)
    }
  }, [actorEmployeeId, sessionExpiresAtUtc, service])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Employee Management
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {canCreate
                ? 'Register new employees and review the active demo directory.'
                : 'Review employee records permitted for your assigned role.'}
            </p>
          </div>
        </div>

        {service.isDemoMode && (
          <div
            role="note"
            className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span className="font-medium">Demo-Only Persistence:</span> No
            backend server or database is currently connected. Employee records
            and RBAC permissions run locally in browser{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
              localStorage
            </code>{' '}
            using synthetic sample data.
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

        {canCreate && (
          <EmployeeRegistrationForm
            existingEmployees={employees}
            onRegister={handleRegister}
            autoFocusFirstField={focusRegistration}
            canAssignHrAdmin={canAssignHrAdmin}
          />
        )}

        <EmployeeRosterTable
          employees={employees}
          isLoading={isLoading}
          loadError={loadError}
          onRetryLoad={handleRetryLoad}
          onClearAll={canDelete ? handleClearAll : undefined}
          onResetDemo={canDelete ? handleResetDemo : undefined}
          isActionBusy={isActionBusy}
          canManageDestructiveActions={canDelete}
          scopeDescription={scopeDescription}
        />
      </div>
    </AppLayout>
  )
}
