import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import AttendanceHistoryTable from '../features/attendance/components/AttendanceHistoryTable'
import AttendanceStatusCard from '../features/attendance/components/AttendanceStatusCard'
import {
  attendanceService as defaultAttendanceService,
  type AttendanceService,
} from '../features/attendance/services/attendanceService'
import {
  getDemoActingEmployeeId,
  setDemoActingEmployeeId,
} from '../features/auth/demoSession'
import {
  employeeService as defaultEmployeeService,
  type EmployeeService,
} from '../features/employees/services/employeeService'
import { normalizeEmployeeId } from '../features/employees/validation/employeeSchema'
import { BUSINESS_TIMEZONE, type AttendanceRecord } from '../types/attendance'
import type { Employee } from '../types/employee'

interface AttendancePageProps {
  empService?: EmployeeService
  attService?: AttendanceService
  initialActorEmployeeId?: string | null
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

function resolveInitialActorId(
  employees: readonly Employee[],
  preferredId: string | null,
): string | null {
  if (employees.length === 0) {
    return null
  }
  if (preferredId) {
    const match = employees.find(
      (emp) => normalizeEmployeeId(emp.employeeId) === normalizeEmployeeId(preferredId),
    )
    if (match) {
      return match.employeeId
    }
  }
  const activeEmployee = employees.find(
    (emp) => emp.employmentStatus !== 'Inactive',
  )
  return (activeEmployee ?? employees[0]).employeeId
}

export default function Attendance({
  empService = defaultEmployeeService,
  attService = defaultAttendanceService,
  initialActorEmployeeId,
}: AttendancePageProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [actingEmployeeId, setActingEmployeeId] = useState<string | null>(() => {
    if (initialActorEmployeeId !== undefined) {
      return initialActorEmployeeId
    }
    return getDemoActingEmployeeId()
  })
  const initialActorRef = useRef<string | null>(actingEmployeeId)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [activeSession, setActiveSession] = useState<AttendanceRecord | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<
    'clock-in' | 'clock-out' | 'clear' | null
  >(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const actingEmployee = useMemo(() => {
    if (!actingEmployeeId) {
      return null
    }
    const targetKey = normalizeEmployeeId(actingEmployeeId)
    return (
      employees.find(
        (emp) => normalizeEmployeeId(emp.employeeId) === targetKey,
      ) ?? null
    )
  }, [employees, actingEmployeeId])

  const loadWorkspace = useCallback(
    async (preferredActorId: string | null) => {
      const loadedEmployees = await empService.listEmployees()
      const resolvedActorId = resolveInitialActorId(
        loadedEmployees,
        preferredActorId,
      )

      if (!resolvedActorId) {
        return {
          loadedEmployees,
          resolvedActorId: null,
          loadedRecords: [] as AttendanceRecord[],
          currentActive: null as AttendanceRecord | null,
        }
      }

      if (initialActorEmployeeId === undefined) {
        setDemoActingEmployeeId(resolvedActorId)
      }

      const actor = { actorEmployeeId: resolvedActorId }
      const [loadedRecords, currentActive] = await Promise.all([
        attService.listAttendanceRecords(actor),
        attService.getActiveSession(resolvedActorId, actor),
      ])

      return {
        loadedEmployees,
        resolvedActorId,
        loadedRecords,
        currentActive,
      }
    },
    [empService, attService, initialActorEmployeeId],
  )

  useEffect(() => {
    let cancelled = false

    loadWorkspace(initialActorRef.current)
      .then((result) => {
        if (!cancelled) {
          setEmployees(result.loadedEmployees)
          setActingEmployeeId(result.resolvedActorId)
          setRecords(result.loadedRecords)
          setActiveSession(result.currentActive)
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            getErrorMessage(error, 'Failed to load attendance workspace.'),
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
  }, [loadWorkspace])

  const handleActorChange = useCallback(
    async (nextEmployeeId: string) => {
      setActingEmployeeId(nextEmployeeId)
      if (initialActorEmployeeId === undefined) {
        setDemoActingEmployeeId(nextEmployeeId)
      }
      setActionError(null)
      setActionSuccess(null)
      setLoadError(null)
      setIsLoading(true)

      try {
        const actor = { actorEmployeeId: nextEmployeeId }
        const [loadedRecords, currentActive] = await Promise.all([
          attService.listAttendanceRecords(actor),
          attService.getActiveSession(nextEmployeeId, actor),
        ])
        setRecords(loadedRecords)
        setActiveSession(currentActive)
      } catch (error: unknown) {
        setLoadError(
          getErrorMessage(error, 'Failed to load attendance for selected user.'),
        )
      } finally {
        setIsLoading(false)
      }
    },
    [attService, initialActorEmployeeId],
  )

  const handleRetryLoad = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setActionError(null)
    try {
      const result = await loadWorkspace(actingEmployeeId)
      setEmployees(result.loadedEmployees)
      setActingEmployeeId(result.resolvedActorId)
      setRecords(result.loadedRecords)
      setActiveSession(result.currentActive)
    } catch (error: unknown) {
      setLoadError(
        getErrorMessage(error, 'Failed to load attendance workspace.'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadWorkspace, actingEmployeeId])

  const handleClockIn = useCallback(async () => {
    if (!actingEmployee) {
      setActionError('Select an active employee before clocking in.')
      return
    }

    setPendingAction('clock-in')
    setActionError(null)
    setActionSuccess(null)

    try {
      const actor = { actorEmployeeId: actingEmployee.employeeId }
      const created = await attService.clockIn(
        { employeeId: actingEmployee.employeeId },
        actor,
      )
      const refreshedRecords = await attService.listAttendanceRecords(actor)
      setActiveSession(created)
      setRecords(refreshedRecords)
      setActionSuccess(
        `Clocked in ${created.employeeName} (${created.employeeId}) for shift date ${created.attendanceDate}.`,
      )
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, 'Unable to clock in.'))
    } finally {
      setPendingAction(null)
    }
  }, [actingEmployee, attService])

  const handleClockOut = useCallback(async () => {
    if (!actingEmployee) {
      setActionError('Select an active employee before clocking out.')
      return
    }

    setPendingAction('clock-out')
    setActionError(null)
    setActionSuccess(null)

    try {
      const actor = { actorEmployeeId: actingEmployee.employeeId }
      const completed = await attService.clockOut(
        {
          employeeId: actingEmployee.employeeId,
          sessionId: activeSession?.id,
        },
        actor,
      )
      const refreshedRecords = await attService.listAttendanceRecords(actor)
      setActiveSession(null)
      setRecords(refreshedRecords)
      setActionSuccess(
        `Clocked out ${completed.employeeName} (${completed.employeeId}). Recorded shift duration: ${completed.durationMinutes ?? 0} min.`,
      )
    } catch (error: unknown) {
      setActionError(getErrorMessage(error, 'Unable to clock out.'))
    } finally {
      setPendingAction(null)
    }
  }, [actingEmployee, activeSession, attService])

  const handleClearDemoRecords = useCallback(async () => {
    setPendingAction('clear')
    setActionError(null)
    setActionSuccess(null)
    try {
      await attService.clearAttendanceRecords()
      setRecords([])
      setActiveSession(null)
    } catch (error: unknown) {
      setActionError(
        getErrorMessage(error, 'Failed to clear demo attendance records.'),
      )
    } finally {
      setPendingAction(null)
    }
  }, [attService])

  const isHrOversightView =
    actingEmployee?.assignedRole === 'HR Admin' ||
    actingEmployee?.assignedRole === 'HR Coordinator'

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Attendance Management
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Record employee clock-in and clock-out sessions in{' '}
              {BUSINESS_TIMEZONE} and review verified attendance history.
            </p>
          </div>
        </div>

        {attService.isDemoMode && (
          <div
            role="note"
            className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span className="font-medium">Demo-Only Attendance Mode:</span> No
            backend server or database is connected. Clock-in and clock-out
            timestamps are generated in the browser and stored in{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
              localStorage
            </code>
            . Production deployment requires server-authoritative timestamps and
            authenticated API enforcement.
          </div>
        )}

        <section
          aria-labelledby="demo-actor-heading"
          className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                id="demo-actor-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Demo Session Identity
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Simulates the currently signed-in employee while backend
                authentication is unimplemented.
              </p>
            </div>

            {employees.length > 0 ? (
              <div className="min-w-64">
                <label
                  htmlFor="acting-demo-employee"
                  className="block text-xs font-medium text-slate-700"
                >
                  Acting Demo Employee
                </label>
                <select
                  id="acting-demo-employee"
                  value={actingEmployee?.employeeId ?? ''}
                  onChange={(event) => void handleActorChange(event.target.value)}
                  disabled={pendingAction !== null}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.employeeId}>
                      {employee.employeeId} — {employee.fullName} (
                      {employee.assignedRole} · {employee.employmentStatus})
                    </option>
                  ))}
                </select>
              </div>
            ) : !isLoading ? (
              <div className="text-sm text-slate-700">
                No registered employees found.{' '}
                <Link
                  to="/employees/new"
                  className="font-medium text-blue-700 underline hover:text-blue-800"
                >
                  Register an employee first
                </Link>
                .
              </div>
            ) : null}
          </div>
        </section>

        <AttendanceStatusCard
          employee={actingEmployee}
          activeSession={activeSession}
          isLoading={isLoading}
          isSubmitting={pendingAction !== null}
          pendingAction={
            pendingAction === 'clock-in' || pendingAction === 'clock-out'
              ? pendingAction
              : null
          }
          actionError={actionError}
          actionSuccess={actionSuccess}
          onClockIn={() => void handleClockIn()}
          onClockOut={() => void handleClockOut()}
          onDismissSuccess={() => setActionSuccess(null)}
        />

        <AttendanceHistoryTable
          records={records}
          isLoading={isLoading}
          loadError={loadError}
          isHrOversightView={isHrOversightView}
          actingEmployeeLabel={
            actingEmployee
              ? `${actingEmployee.fullName} (${actingEmployee.employeeId})`
              : null
          }
          isActionBusy={pendingAction !== null}
          onRetryLoad={() => void handleRetryLoad()}
          onClearDemoRecords={() => void handleClearDemoRecords()}
        />
      </div>
    </AppLayout>
  )
}
