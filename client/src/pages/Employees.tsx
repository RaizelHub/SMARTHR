import { useCallback, useEffect, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
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
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isActionBusy, setIsActionBusy] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    service
      .listEmployees()
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
  }, [service])

  const handleRetryLoad = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setActionError(null)
    try {
      const records = await service.listEmployees()
      setEmployees(records)
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error, 'Failed to load employee records.'))
    } finally {
      setIsLoading(false)
    }
  }, [service])

  const handleRegister = useCallback(
    async (input: CreateEmployeeInput): Promise<Employee> => {
      setActionError(null)
      const created = await service.createEmployee(input)
      setEmployees((previous) => [created, ...previous])
      return created
    },
    [service],
  )

  const handleClearAll = useCallback(async () => {
    setIsActionBusy(true)
    setActionError(null)
    try {
      const updated = await service.clearEmployees()
      setEmployees(updated)
    } catch (error: unknown) {
      setActionError(
        getErrorMessage(error, 'Failed to clear demo employee records.'),
      )
    } finally {
      setIsActionBusy(false)
    }
  }, [service])

  const handleResetDemo = useCallback(async () => {
    setIsActionBusy(true)
    setActionError(null)
    setLoadError(null)
    try {
      const restored = await service.resetDemoEmployees()
      setEmployees(restored)
    } catch (error: unknown) {
      setActionError(
        getErrorMessage(error, 'Failed to reset demo employee records.'),
      )
    } finally {
      setIsActionBusy(false)
    }
  }, [service])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Employee Management
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Register new employees and review the active demo directory.
            </p>
          </div>
        </div>

        {service.isDemoMode && (
          <div
            role="note"
            className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span className="font-medium">Demo-Only Persistence:</span> No
            backend server or database is currently connected. Registered
            employees are saved locally in your browser via{' '}
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

        <EmployeeRegistrationForm
          existingEmployees={employees}
          onRegister={handleRegister}
          autoFocusFirstField={focusRegistration}
        />

        <EmployeeRosterTable
          employees={employees}
          isLoading={isLoading}
          loadError={loadError}
          onRetryLoad={handleRetryLoad}
          onClearAll={handleClearAll}
          onResetDemo={handleResetDemo}
          isActionBusy={isActionBusy}
        />
      </div>
    </AppLayout>
  )
}

