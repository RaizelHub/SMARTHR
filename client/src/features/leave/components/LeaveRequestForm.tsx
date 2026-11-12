import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Employee } from '../../../types/employee'
import {
  LEAVE_TYPES,
  type LeaveRequest,
  type SubmitLeaveRequestInput,
} from '../../../types/leave'
import { LeaveServiceError } from '../services/leaveService'
import {
  createLeaveRequestFormSchema,
  LEAVE_FIELD_LIMITS,
  type LeaveRequestFormInput,
  type LeaveRequestFormOutput,
} from '../validation/leaveSchema'

interface LeaveRequestFormProps {
  employee: Employee | null
  existingRequests: readonly LeaveRequest[]
  onSubmitRequest: (input: SubmitLeaveRequestInput) => Promise<LeaveRequest>
}

const DEFAULT_FORM_VALUES: LeaveRequestFormInput = {
  leaveType: '',
  startDate: '',
  endDate: '',
  reason: '',
}

function getInputClasses(hasError: boolean): string {
  const base =
    'mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2'
  return hasError
    ? `${base} border-red-400 focus:border-red-500 focus:ring-red-500`
    : `${base} border-slate-300 focus:border-blue-600 focus:ring-blue-600`
}

export default function LeaveRequestForm({
  employee,
  existingRequests,
  onSubmitRequest,
}: LeaveRequestFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  const schema = useMemo(
    () =>
      createLeaveRequestFormSchema({
        employeeId: employee?.employeeId ?? '',
        existingRequests,
      }),
    [employee?.employeeId, existingRequests],
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LeaveRequestFormInput, unknown, LeaveRequestFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: 'onSubmit',
  })

  const isInactive = employee?.employmentStatus === 'Inactive'
  const isDisabled = !employee || isInactive || isSubmitting

  async function onSubmit(values: LeaveRequestFormOutput) {
    if (!employee) {
      setSubmitError('Select an acting employee before submitting a request.')
      return
    }

    setSubmitError(null)
    setSuccessNotice(null)

    try {
      const created = await onSubmitRequest({
        employeeId: employee.employeeId,
        leaveType: values.leaveType,
        startDate: values.startDate,
        endDate: values.endDate,
        reason: values.reason,
      })

      reset(DEFAULT_FORM_VALUES)
      setSuccessNotice(
        `Submitted ${created.leaveType} request (${created.startDate} to ${created.endDate}, ${created.calendarDays} calendar day${created.calendarDays === 1 ? '' : 's'}). Status: ${created.status}.`,
      )
    } catch (error: unknown) {
      if (error instanceof LeaveServiceError) {
        if (error.fieldErrors) {
          for (const [field, message] of Object.entries(error.fieldErrors)) {
            if (
              message &&
              (field === 'leaveType' ||
                field === 'startDate' ||
                field === 'endDate' ||
                field === 'reason')
            ) {
              setError(field, {
                type: 'server',
                message,
              })
            }
          }
        }
        setSubmitError(error.message)
        return
      }

      if (error instanceof Error && error.message.trim().length > 0) {
        setSubmitError(error.message)
        return
      }

      setSubmitError(
        'An unexpected error occurred while submitting the leave request.',
      )
    }
  }

  function handleReset() {
    reset(DEFAULT_FORM_VALUES)
    setSubmitError(null)
    setSuccessNotice(null)
  }

  return (
    <section
      aria-labelledby="leave-request-heading"
      className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="border-b border-slate-200 pb-4">
        <h2
          id="leave-request-heading"
          className="text-lg font-semibold text-slate-900"
        >
          Request Leave
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Submit a leave request for{' '}
          {employee ? (
            <span className="font-medium text-slate-800">
              {employee.fullName} ({employee.employeeId})
            </span>
          ) : (
            'the selected employee'
          )}
          . Leave entitlements and balances are pending company policy
          configuration.
        </p>
      </div>

      {isInactive && (
        <div
          role="note"
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Employees with status <strong>Inactive</strong> cannot submit new
          leave requests.
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-medium">Unable to submit leave request</p>
          <p className="mt-0.5">{submitError}</p>
        </div>
      )}

      {successNotice && (
        <div
          role="status"
          className="mt-4 flex items-start justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <div>
            <p className="font-medium">Leave request submitted</p>
            <p className="mt-0.5">{successNotice}</p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="rounded px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="leave-type"
              className="block text-sm font-medium text-slate-700"
            >
              Leave Type <span className="text-red-600">*</span>
            </label>
            <select
              id="leave-type"
              disabled={isDisabled}
              aria-invalid={Boolean(errors.leaveType)}
              aria-describedby={
                errors.leaveType ? 'leave-type-error' : undefined
              }
              className={getInputClasses(Boolean(errors.leaveType))}
              {...register('leaveType')}
            >
              <option value="">Select leave type</option>
              {LEAVE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {errors.leaveType && (
              <p
                id="leave-type-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.leaveType.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="leave-start-date"
              className="block text-sm font-medium text-slate-700"
            >
              Start Date <span className="text-red-600">*</span>
            </label>
            <input
              id="leave-start-date"
              type="date"
              disabled={isDisabled}
              aria-invalid={Boolean(errors.startDate)}
              aria-describedby={
                errors.startDate ? 'leave-start-date-error' : undefined
              }
              className={getInputClasses(Boolean(errors.startDate))}
              {...register('startDate')}
            />
            {errors.startDate && (
              <p
                id="leave-start-date-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.startDate.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="leave-end-date"
              className="block text-sm font-medium text-slate-700"
            >
              End Date <span className="text-red-600">*</span>
            </label>
            <input
              id="leave-end-date"
              type="date"
              disabled={isDisabled}
              aria-invalid={Boolean(errors.endDate)}
              aria-describedby={
                errors.endDate ? 'leave-end-date-error' : undefined
              }
              className={getInputClasses(Boolean(errors.endDate))}
              {...register('endDate')}
            />
            {errors.endDate && (
              <p
                id="leave-end-date-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.endDate.message}
              </p>
            )}
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="leave-reason"
              className="block text-sm font-medium text-slate-700"
            >
              Reason (Optional)
            </label>
            <textarea
              id="leave-reason"
              rows={2}
              maxLength={LEAVE_FIELD_LIMITS.reasonMax}
              disabled={isDisabled}
              placeholder="Optional context for your manager or HR reviewer"
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={
                errors.reason ? 'leave-reason-error' : 'leave-reason-hint'
              }
              className={getInputClasses(Boolean(errors.reason))}
              {...register('reason')}
            />
            {errors.reason ? (
              <p
                id="leave-reason-error"
                role="alert"
                className="mt-1 text-xs text-red-700"
              >
                {errors.reason.message}
              </p>
            ) : (
              <p id="leave-reason-hint" className="mt-1 text-xs text-slate-500">
                Maximum {LEAVE_FIELD_LIMITS.reasonMax} characters. Calendar span
                includes all dates from start to end until working-day/holiday
                rules are configured.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSubmitting}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Clear Form
          </button>
          <button
            type="submit"
            disabled={isDisabled}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Leave Request'}
          </button>
        </div>
      </form>
    </section>
  )
}

