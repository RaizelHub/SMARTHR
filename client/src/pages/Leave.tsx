import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import {
  getDemoActingEmployeeId,
  setDemoActingEmployeeId,
} from '../features/auth/demoSession'
import {
  employeeService as defaultEmployeeService,
  type EmployeeService,
} from '../features/employees/services/employeeService'
import { normalizeEmployeeId } from '../features/employees/validation/employeeSchema'
import LeaveRequestForm from '../features/leave/components/LeaveRequestForm'
import LeaveRequestHistoryTable from '../features/leave/components/LeaveRequestHistoryTable'
import LeaveReviewQueue from '../features/leave/components/LeaveReviewQueue'
import {
  isReviewerRole,
  leaveService as defaultLeaveService,
  type LeaveService,
} from '../features/leave/services/leaveService'
import type { Employee } from '../types/employee'
import type { LeaveRequest, SubmitLeaveRequestInput } from '../types/leave'

interface LeavePageProps {
  empService?: EmployeeService
  lvService?: LeaveService
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
      (emp) =>
        normalizeEmployeeId(emp.employeeId) === normalizeEmployeeId(preferredId),
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

export default function Leave({
  empService = defaultEmployeeService,
  lvService = defaultLeaveService,
  initialActorEmployeeId,
}: LeavePageProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [actingEmployeeId, setActingEmployeeId] = useState<string | null>(() => {
    if (initialActorEmployeeId !== undefined) {
      return initialActorEmployeeId
    }
    return getDemoActingEmployeeId()
  })
  const initialActorRef = useRef<string | null>(actingEmployeeId)
  const [visibleRequests, setVisibleRequests] = useState<LeaveRequest[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null)
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

  const ownRequests = useMemo(() => {
    if (!actingEmployee) {
      return []
    }
    const ownKey = normalizeEmployeeId(actingEmployee.employeeId)
    return visibleRequests.filter(
      (request) => normalizeEmployeeId(request.employeeId) === ownKey,
    )
  }, [actingEmployee, visibleRequests])

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
          loadedRequests: [] as LeaveRequest[],
        }
      }

      if (initialActorEmployeeId === undefined) {
        setDemoActingEmployeeId(resolvedActorId)
      }

      const loadedRequests = await lvService.listLeaveRequests({
        actorEmployeeId: resolvedActorId,
      })

      return {
        loadedEmployees,
        resolvedActorId,
        loadedRequests,
      }
    },
    [empService, lvService, initialActorEmployeeId],
  )

  useEffect(() => {
    let cancelled = false

    loadWorkspace(initialActorRef.current)
      .then((result) => {
        if (!cancelled) {
          setEmployees(result.loadedEmployees)
          setActingEmployeeId(result.resolvedActorId)
          setVisibleRequests(result.loadedRequests)
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            getErrorMessage(error, 'Failed to load leave management workspace.'),
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
        const loadedRequests = await lvService.listLeaveRequests({
          actorEmployeeId: nextEmployeeId,
        })
        setVisibleRequests(loadedRequests)
      } catch (error: unknown) {
        setLoadError(
          getErrorMessage(
            error,
            'Failed to load leave requests for the selected employee.',
          ),
        )
      } finally {
        setIsLoading(false)
      }
    },
    [lvService, initialActorEmployeeId],
  )

  const handleRetryLoad = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setActionError(null)
    try {
      const result = await loadWorkspace(actingEmployeeId)
      setEmployees(result.loadedEmployees)
      setActingEmployeeId(result.resolvedActorId)
      setVisibleRequests(result.loadedRequests)
    } catch (error: unknown) {
      setLoadError(
        getErrorMessage(error, 'Failed to load leave management workspace.'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadWorkspace, actingEmployeeId])

  const handleSubmitRequest = useCallback(
    async (input: SubmitLeaveRequestInput): Promise<LeaveRequest> => {
      if (!actingEmployee) {
        throw new Error('Select an acting employee before submitting a request.')
      }

      setActionError(null)
      setActionSuccess(null)

      const actor = { actorEmployeeId: actingEmployee.employeeId }
      const created = await lvService.submitLeaveRequest(input, actor)
      const refreshed = await lvService.listLeaveRequests(actor)
      setVisibleRequests(refreshed)
      return created
    },
    [actingEmployee, lvService],
  )

  const handleCancelRequest = useCallback(
    async (requestId: string) => {
      if (!actingEmployee) {
        return
      }

      setBusyRequestId(requestId)
      setActionError(null)
      setActionSuccess(null)

      try {
        const actor = { actorEmployeeId: actingEmployee.employeeId }
        const cancelled = await lvService.cancelLeaveRequest(requestId, actor)
        const refreshed = await lvService.listLeaveRequests(actor)
        setVisibleRequests(refreshed)
        setActionSuccess(
          `Cancelled ${cancelled.leaveType} request (${cancelled.startDate} to ${cancelled.endDate}).`,
        )
      } catch (error: unknown) {
        setActionError(getErrorMessage(error, 'Failed to cancel leave request.'))
      } finally {
        setBusyRequestId(null)
      }
    },
    [actingEmployee, lvService],
  )

  const handleReviewRequest = useCallback(
    async (
      requestId: string,
      decision: 'Approved' | 'Rejected',
      reviewerNote: string,
    ) => {
      if (!actingEmployee) {
        return
      }

      setBusyRequestId(requestId)
      setActionError(null)
      setActionSuccess(null)

      try {
        const actor = { actorEmployeeId: actingEmployee.employeeId }
        const decided = await lvService.reviewLeaveRequest(
          { requestId, decision, reviewerNote },
          actor,
        )
        const refreshed = await lvService.listLeaveRequests(actor)
        setVisibleRequests(refreshed)
        setActionSuccess(
          `${decided.status} ${decided.employeeName}'s ${decided.leaveType} request (${decided.startDate} to ${decided.endDate}).`,
        )
      } catch (error: unknown) {
        setActionError(getErrorMessage(error, 'Failed to review leave request.'))
      } finally {
        setBusyRequestId(null)
      }
    },
    [actingEmployee, lvService],
  )

  const showReviewQueue = Boolean(
    actingEmployee && isReviewerRole(actingEmployee.assignedRole),
  )

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Leave Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Submit employee leave requests, track approval status, and review
            team requests based on role permissions.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {lvService.isDemoMode && (
            <div
              role="note"
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <span className="font-medium">Demo-Only Persistence:</span> No
              backend server or database is connected. Leave requests and
              decisions are stored locally in browser{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
                localStorage
              </code>
              .
            </div>
          )}

          {!lvService.balanceTrackingSupported && (
            <div
              role="note"
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
            >
              <span className="font-medium text-slate-900">
                Leave Balances Not Configured:
              </span>{' '}
              Company leave entitlements, statutory accruals, and holiday/weekend
              deduction policies are not yet defined. Leave balances will be
              integrated once HR policies are configured.
            </div>
          )}
        </div>

        <section
          aria-labelledby="leave-demo-actor-heading"
          className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                id="leave-demo-actor-heading"
                className="text-sm font-semibold text-slate-900"
              >
                Demo Session Identity
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Switch between Employee, Manager, or HR roles to test submission
                ownership and approval authorization.
              </p>
            </div>

            {employees.length > 0 ? (
              <div className="min-w-64">
                <label
                  htmlFor="leave-acting-demo-employee"
                  className="block text-xs font-medium text-slate-700"
                >
                  Acting Demo Employee
                </label>
                <select
                  id="leave-acting-demo-employee"
                  value={actingEmployee?.employeeId ?? ''}
                  onChange={(event) => void handleActorChange(event.target.value)}
                  disabled={busyRequestId !== null}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.employeeId}>
                      {employee.employeeId} — {employee.fullName} (
                      {employee.assignedRole} · {employee.department})
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

        <LeaveRequestForm
          employee={actingEmployee}
          existingRequests={ownRequests}
          onSubmitRequest={handleSubmitRequest}
        />

        <LeaveRequestHistoryTable
          requests={ownRequests}
          isLoading={isLoading}
          loadError={loadError}
          busyRequestId={busyRequestId}
          actingEmployeeLabel={
            actingEmployee
              ? `${actingEmployee.fullName} (${actingEmployee.employeeId})`
              : null
          }
          onRetryLoad={() => void handleRetryLoad()}
          onCancelRequest={handleCancelRequest}
        />

        {showReviewQueue && actingEmployee && (
          <LeaveReviewQueue
            reviewer={actingEmployee}
            requests={visibleRequests}
            isLoading={isLoading}
            busyRequestId={busyRequestId}
            onReviewRequest={handleReviewRequest}
          />
        )}
      </div>
    </AppLayout>
  )
}

