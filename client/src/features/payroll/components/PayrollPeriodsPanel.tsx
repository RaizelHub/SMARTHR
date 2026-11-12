import { useState, type FormEvent } from 'react'
import {
  PAYROLL_SCHEDULES,
  type CreatePayrollPeriodInput,
  type DraftPayrollGenerationResult,
  type PayrollPeriod,
  type PayrollSchedule,
  type StatutoryAllocationMode,
} from '../../../types/payroll'

interface PayrollPeriodsPanelProps {
  periods: readonly PayrollPeriod[]
  selectedPeriodId: string | null
  lastGenerationResult: DraftPayrollGenerationResult | null
  canCreate: boolean
  canCalculate: boolean
  canReview: boolean
  canApprove?: boolean
  canLock?: boolean
  isDemoMode?: boolean
  isBusy: boolean
  onSelectPeriod: (periodId: string) => void
  onCreatePeriod: (input: CreatePayrollPeriodInput) => Promise<void>
  onGenerateDraft: (periodId: string) => Promise<void>
  onMarkInReview: (periodId: string) => Promise<void>
  onReturnForCorrection?: (periodId: string, reason: string) => Promise<void>
  onApprovePeriod?: (
    periodId: string,
    notes?: string,
    expectedVersion?: number,
  ) => Promise<void>
  onLockPeriod?: (periodId: string, expectedVersion?: number) => Promise<void>
}

export default function PayrollPeriodsPanel({
  periods,
  selectedPeriodId,
  lastGenerationResult,
  canCreate,
  canCalculate,
  canReview,
  canApprove = false,
  canLock = false,
  isDemoMode = true,
  isBusy,
  onSelectPeriod,
  onCreatePeriod,
  onGenerateDraft,
  onMarkInReview,
  onReturnForCorrection,
  onApprovePeriod,
  onLockPeriod,
}: PayrollPeriodsPanelProps) {
  const [scheduleType, setScheduleType] =
    useState<PayrollSchedule>('Semimonthly')
  const [label, setLabel] = useState<string>('')
  const [periodStart, setPeriodStart] = useState<string>('')
  const [periodEnd, setPeriodEnd] = useState<string>('')
  const [payDate, setPayDate] = useState<string>('')
  const [semimonthlyHalf, setSemimonthlyHalf] = useState<'' | '1' | '2'>('')
  const [statutoryAllocationMode, setStatutoryAllocationMode] =
    useState<StatutoryAllocationMode>('HALF_HALF')
  const [returningPeriodId, setReturningPeriodId] = useState<string | null>(
    null,
  )
  const [returnReason, setReturnReason] = useState<string>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setFormSuccess(null)
    try {
      await onCreatePeriod({
        label: label || undefined,
        scheduleType,
        periodStart,
        periodEnd,
        payDate,
        semimonthlyHalf:
          !isDemoMode && scheduleType === 'Semimonthly' && semimonthlyHalf !== ''
            ? (Number(semimonthlyHalf) as 1 | 2)
            : undefined,
        statutoryAllocationMode: !isDemoMode
          ? statutoryAllocationMode
          : undefined,
      })
      setLabel('')
      setPeriodStart('')
      setPeriodEnd('')
      setPayDate('')
      setSemimonthlyHalf('')
      setFormSuccess(
        `Created ${scheduleType} payroll period (${periodStart} to ${periodEnd}).`,
      )
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Unable to create payroll period.',
      )
    }
  }

  async function handleConfirmReturn(periodId: string) {
    if (!onReturnForCorrection) return
    await onReturnForCorrection(periodId, returnReason)
    setReturningPeriodId(null)
    setReturnReason('')
  }

  return (
    <section
      aria-labelledby="payroll-periods-heading"
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="border-b border-slate-200 pb-4">
        <h2
          id="payroll-periods-heading"
          className="text-lg font-semibold text-slate-900"
        >
          Payroll Periods &amp; Draft Generation
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Define explicit payroll schedules and cutoff dates, generate draft
          payroll runs without duplicate entries, and lock drafts for authorized
          review.
        </p>
      </div>

      {canCreate && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          aria-label="Create payroll period"
          className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">
            Create Payroll Period
          </h3>

          {formError && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {formError}
            </div>
          )}

          {formSuccess && (
            <div
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            >
              {formSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label
                htmlFor="period-schedule"
                className="block text-xs font-medium text-slate-700"
              >
                Schedule
              </label>
              <select
                id="period-schedule"
                value={scheduleType}
                disabled={isBusy}
                onChange={(e) =>
                  setScheduleType(e.target.value as PayrollSchedule)
                }
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {PAYROLL_SCHEDULES.map((sched) => (
                  <option key={sched} value={sched}>
                    {sched}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="period-label"
                className="block text-xs font-medium text-slate-700"
              >
                Label (Optional)
              </label>
              <input
                id="period-label"
                type="text"
                placeholder="e.g. Nov 1–15 Cutoff"
                value={label}
                disabled={isBusy}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="period-start"
                className="block text-xs font-medium text-slate-700"
              >
                Period Start
              </label>
              <input
                id="period-start"
                type="date"
                value={periodStart}
                disabled={isBusy}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="period-end"
                className="block text-xs font-medium text-slate-700"
              >
                Period End
              </label>
              <input
                id="period-end"
                type="date"
                value={periodEnd}
                disabled={isBusy}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="period-pay-date"
                className="block text-xs font-medium text-slate-700"
              >
                Pay Date
              </label>
              <input
                id="period-pay-date"
                type="date"
                value={payDate}
                disabled={isBusy}
                onChange={(e) => setPayDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          {!isDemoMode && scheduleType === 'Semimonthly' && (
            <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="period-semimonthly-half"
                  className="block text-xs font-medium text-slate-700"
                >
                  Semimonthly Cutoff Half
                </label>
                <select
                  id="period-semimonthly-half"
                  value={semimonthlyHalf}
                  disabled={isBusy}
                  onChange={(e) =>
                    setSemimonthlyHalf(e.target.value as '' | '1' | '2')
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="">Auto-detect from cutoff start date</option>
                  <option value="1">1st Half (1–15)</option>
                  <option value="2">2nd Half (16–End)</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="period-statutory-allocation"
                  className="block text-xs font-medium text-slate-700"
                >
                  Statutory Share Allocation
                </label>
                <select
                  id="period-statutory-allocation"
                  value={statutoryAllocationMode}
                  disabled={isBusy}
                  onChange={(e) =>
                    setStatutoryAllocationMode(
                      e.target.value as StatutoryAllocationMode,
                    )
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="HALF_HALF">Split 50/50 Across Both Halves</option>
                  <option value="FULL_SECOND_HALF">
                    Full Monthly Share on 2nd Half Only
                  </option>
                </select>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {isBusy ? 'Creating...' : 'Create Payroll Period'}
            </button>
          </div>
        </form>
      )}

      {lastGenerationResult &&
        lastGenerationResult.missingCompensationWarnings.length > 0 && (
          <div
            role="alert"
            className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"
          >
            <p className="font-semibold">
              Missing Compensation Warnings (
              {lastGenerationResult.missingCompensationWarnings.length} excluded)
            </p>
            <p className="mt-0.5 text-amber-800">
              These active employees were skipped during draft payroll
              generation for {lastGenerationResult.period.label} because no
              effective-dated compensation covers {lastGenerationResult.period.periodEnd}:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {lastGenerationResult.missingCompensationWarnings.map((warn) => (
                <li key={warn.employeeId}>
                  {warn.employeeName} ({warn.employeeId}, {warn.department}) —{' '}
                  {warn.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

      {periods.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            No payroll periods created yet
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Create a payroll period above, then click Generate Draft Payroll.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            aria-label="Payroll periods"
            className="min-w-full divide-y divide-slate-200 text-left text-sm"
          >
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2.5">
                  Period
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Schedule
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Cutoff Dates
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Pay Date
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {periods.map((period) => {
                const isSelected = period.id === selectedPeriodId
                const isDraft = period.status === 'Draft'
                const isCalculated = period.status === 'Calculated'
                const isUnderReview =
                  period.status === 'Under Review' ||
                  period.status === 'In Review'
                const isApproved = period.status === 'Approved'
                const isLocked = period.status === 'Locked'

                const statusBadgeClass = isDraft
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : isCalculated
                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                    : isApproved
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : isLocked
                        ? 'border-slate-400 bg-slate-200 text-slate-900'
                        : 'border-blue-200 bg-blue-50 text-blue-800'

                const canRunCalculation = isDemoMode
                  ? isDraft && canCalculate
                  : (isDraft || isCalculated) && canCalculate

                const canSubmitReview = isDemoMode
                  ? isDraft && canReview
                  : isCalculated && canReview

                return (
                  <tr
                    key={period.id}
                    className={
                      isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900">
                        {period.label}
                      </div>
                      <div className="text-xs text-slate-500">
                        Created by {period.createdByName}
                      </div>
                      {period.returnedReason && (
                        <div className="mt-0.5 text-xs text-amber-800">
                          Returned: {period.returnedReason}
                        </div>
                      )}
                      {period.approvedByName && (
                        <div className="mt-0.5 text-xs text-emerald-700">
                          Approved by {period.approvedByName}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                      <div>{period.scheduleType}</div>
                      {period.semimonthlyHalf && (
                        <div className="text-xs text-slate-500">
                          Half {period.semimonthlyHalf}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-700">
                      {period.periodStart} to {period.periodEnd}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-700">
                      {period.payDate}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${statusBadgeClass}`}
                      >
                        {period.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectPeriod(period.id)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          {isSelected ? 'Selected' : 'View Entries'}
                        </button>

                        {canRunCalculation && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void onGenerateDraft(period.id)}
                            className="rounded-md bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            {isDemoMode
                              ? 'Generate Draft Payroll'
                              : isCalculated
                                ? 'Recalculate Payroll'
                                : 'Calculate Payroll'}
                          </button>
                        )}

                        {canSubmitReview && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void onMarkInReview(period.id)}
                            className="rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          >
                            {isDemoMode ? 'Mark In Review' : 'Submit for Review'}
                          </button>
                        )}

                        {!isDemoMode &&
                          isUnderReview &&
                          (canReview || canApprove) &&
                          onReturnForCorrection && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                setReturningPeriodId((cur) =>
                                  cur === period.id ? null : period.id,
                                )
                              }
                              className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-600"
                            >
                              Return for Correction
                            </button>
                          )}

                        {!isDemoMode &&
                          isUnderReview &&
                          canApprove &&
                          onApprovePeriod && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void onApprovePeriod(
                                  period.id,
                                  undefined,
                                  period.version,
                                )
                              }
                              className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                            >
                              Approve Payroll
                            </button>
                          )}

                        {!isDemoMode &&
                          isApproved &&
                          canLock &&
                          onLockPeriod && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void onLockPeriod(period.id, period.version)
                              }
                              className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-600"
                            >
                              Lock Period
                            </button>
                          )}
                      </div>

                      {!isDemoMode && returningPeriodId === period.id && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border border-amber-200 bg-amber-50 p-2">
                          <input
                            type="text"
                            aria-label={`Return reason for ${period.label}`}
                            placeholder="Reason for correction (min 5 chars)"
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            className="w-56 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-slate-900"
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleConfirmReturn(period.id)}
                            className="rounded bg-amber-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-800"
                          >
                            Confirm Return
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

