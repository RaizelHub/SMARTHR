import { useCallback, useEffect, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import AttendanceHistoryTable from '../features/attendance/components/AttendanceHistoryTable'
import AttendanceStatusCard from '../features/attendance/components/AttendanceStatusCard'
import {
  attendanceService as defaultAttendanceService,
  type AttendanceService,
} from '../features/attendance/services/attendanceService'
import { useAuth } from '../features/auth/authContextStore'
import { BUSINESS_TIMEZONE, type AttendanceRecord } from '../types/attendance'

interface AttendancePageProps {
  attService?: AttendanceService
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

export default function Attendance({
  attService = defaultAttendanceService,
}: AttendancePageProps) {
  const auth = useAuth()
  const actingEmployee = auth.currentUser
  const actorEmployeeId = auth.actorContext.actorEmployeeId
  const sessionExpiresAtUtc = auth.actorContext.sessionExpiresAtUtc

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

  const loadWorkspace = useCallback(async () => {
    const actor = { actorEmployeeId, sessionExpiresAtUtc }
    if (!actorEmployeeId) {
      const deniedRecords = await attService.listAttendanceRecords(actor)
      return {
        loadedRecords: deniedRecords,
        currentActive: null as AttendanceRecord | null,
      }
    }

    const [loadedRecords, currentActive] = await Promise.all([
      attService.listAttendanceRecords(actor),
      attService.getActiveSession(actorEmployeeId, actor),
    ])

    return {
      loadedRecords,
      currentActive,
    }
  }, [actorEmployeeId, attService, sessionExpiresAtUtc])

  useEffect(() => {
    let cancelled = false

    loadWorkspace()
      .then((result) => {
        if (!cancelled) {
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

  const handleRetryLoad = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setActionError(null)
    try {
      const result = await loadWorkspace()
      setRecords(result.loadedRecords)
      setActiveSession(result.currentActive)
    } catch (error: unknown) {
      setLoadError(
        getErrorMessage(error, 'Failed to load attendance workspace.'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadWorkspace])

  const handleClockIn = useCallback(async () => {
    if (!actingEmployee) {
      setActionError('An authenticated employee session is required.')
      return
    }

    setPendingAction('clock-in')
    setActionError(null)
    setActionSuccess(null)

    try {
      const actor = {
        actorEmployeeId: actingEmployee.employeeId,
        sessionExpiresAtUtc,
      }
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
  }, [actingEmployee, attService, sessionExpiresAtUtc])

  const handleClockOut = useCallback(async () => {
    if (!actingEmployee) {
      setActionError('An authenticated employee session is required.')
      return
    }

    setPendingAction('clock-out')
    setActionError(null)
    setActionSuccess(null)

    try {
      const actor = {
        actorEmployeeId: actingEmployee.employeeId,
        sessionExpiresAtUtc,
      }
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
  }, [actingEmployee, activeSession, attService, sessionExpiresAtUtc])

  const handleClearDemoRecords = useCallback(async () => {
    setPendingAction('clear')
    setActionError(null)
    setActionSuccess(null)
    try {
      await attService.clearAttendanceRecords({
        actorEmployeeId,
        sessionExpiresAtUtc,
      })
      setRecords([])
      setActiveSession(null)
    } catch (error: unknown) {
      setActionError(
        getErrorMessage(error, 'Failed to clear demo attendance records.'),
      )
    } finally {
      setPendingAction(null)
    }
  }, [actorEmployeeId, attService, sessionExpiresAtUtc])

  const visibilityScope: 'all' | 'team' | 'own' = auth.hasPermission(
    'attendance.read_all',
  )
    ? 'all'
    : auth.hasPermission('attendance.read_team')
      ? 'team'
      : 'own'

  const canClearDemoRecords = auth.hasPermission('employees.delete')

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Attendance Management
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Record your own clock-in and clock-out sessions in{' '}
              {BUSINESS_TIMEZONE} and review attendance history permitted for
              your role.
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
          visibilityScope={visibilityScope}
          actingDepartment={actingEmployee?.department ?? null}
          actingEmployeeLabel={
            actingEmployee
              ? `${actingEmployee.fullName} (${actingEmployee.employeeId})`
              : null
          }
          canClearDemoRecords={canClearDemoRecords}
          isActionBusy={pendingAction !== null}
          onRetryLoad={() => void handleRetryLoad()}
          onClearDemoRecords={
            canClearDemoRecords ? () => void handleClearDemoRecords() : undefined
          }
        />
      </div>
    </AppLayout>
  )
}
