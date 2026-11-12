import { useState } from 'react'
import type {
  AddManualAdjustmentInput,
  PayrollEntry,
  PayrollLineCategory,
  PayrollPeriod,
  SetConfirmedPayableUnitsInput,
} from '../../../types/payroll'
import {
  formatHundredths,
  formatPhpFromCentavos,
  sumCentavos,
} from '../utils/money'

interface DraftPayrollTableProps {
  period: PayrollPeriod | null
  entries: readonly PayrollEntry[]
  canCalculate: boolean
  isDemoMode?: boolean
  isBusy: boolean
  onConfirmUnits: (input: SetConfirmedPayableUnitsInput) => Promise<void>
  onAddAdjustment: (input: AddManualAdjustmentInput) => Promise<void>
  onPreviewPayslip: (entry: PayrollEntry) => void
}

export default function DraftPayrollTable({
  period,
  entries,
  canCalculate,
  isDemoMode = true,
  isBusy,
  onConfirmUnits,
  onAddAdjustment,
  onPreviewPayslip,
}: DraftPayrollTableProps) {
  const [unitInputs, setUnitInputs] = useState<Record<string, string>>({})
  const [adjustingEntryId, setAdjustingEntryId] = useState<string | null>(null)
  const [adjCategory, setAdjCategory] =
    useState<PayrollLineCategory>('Earning')
  const [adjLabel, setAdjLabel] = useState<string>('')
  const [adjAmount, setAdjAmount] = useState<string>('')
  const [adjTaxable, setAdjTaxable] = useState<'default' | 'taxable' | 'nontaxable'>('default')
  const [rowError, setRowError] = useState<string | null>(null)

  if (!period) {
    return (
      <section
        aria-labelledby="draft-payroll-heading"
        className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
      >
        <h2
          id="draft-payroll-heading"
          className="text-lg font-semibold text-slate-900"
        >
          Draft Payroll Entries
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Select or create a payroll period above to generate and inspect draft
          payroll calculations.
        </p>
      </section>
    )
  }

  const totalGrossCentavos = sumCentavos(entries.map((e) => e.grossPayCentavos))
  const totalDeductionsCentavos = sumCentavos(
    entries.map((e) => e.totalDeductionsCentavos),
  )
  const totalEmployerCostCentavos = sumCentavos(
    entries.map((e) => e.totalEmployerCostCentavos ?? 0),
  )
  const totalNetCentavos = sumCentavos(entries.map((e) => e.netPayCentavos))
  const reviewCount = entries.filter((e) => e.requiresReview).length
  const isDraftPeriod = isDemoMode
    ? period.status === 'Draft'
    : period.status === 'Draft' || period.status === 'Calculated'
  const isLockedStage = !isDraftPeriod

  async function handleSaveUnits(entryId: string) {
    setRowError(null)
    try {
      await onConfirmUnits({
        entryId,
        unitsInput: unitInputs[entryId] ?? '',
      })
    } catch (error) {
      setRowError(
        error instanceof Error
          ? error.message
          : 'Unable to update confirmed payable units.',
      )
    }
  }

  async function handleSubmitAdjustment(entryId: string) {
    setRowError(null)
    try {
      await onAddAdjustment({
        entryId,
        category: adjCategory === 'EmployerCost' ? 'Earning' : adjCategory,
        label: adjLabel,
        amountInput: adjAmount,
        isTaxable:
          !isDemoMode && adjTaxable !== 'default'
            ? adjTaxable === 'taxable'
            : undefined,
      })
      setAdjustingEntryId(null)
      setAdjLabel('')
      setAdjAmount('')
      setAdjTaxable('default')
    } catch (error) {
      setRowError(
        error instanceof Error
          ? error.message
          : 'Unable to add manual payroll adjustment.',
      )
    }
  }

  return (
    <section
      aria-labelledby="draft-payroll-heading"
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="draft-payroll-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Payroll Run: {period.label}
            </h2>
            <span
              className={
                isDraftPeriod
                  ? 'inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800'
                  : 'inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800'
              }
            >
              {period.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Schedule: {period.scheduleType} · Cutoff: {period.periodStart} to{' '}
            {period.periodEnd} · Pay Date: {period.payDate}
          </p>
        </div>

        <span className="rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {isDemoMode
            ? 'Final Approval & Disbursement Disabled (Phase 6B)'
            : 'Philippine Statutory Engine Active · Payment Disbursement Excluded'}
        </span>
      </div>

      {isLockedStage && (
        <div
          role="note"
          className="rounded-md border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-900"
        >
          {isDemoMode ? (
            <>
              This payroll period is <span className="font-semibold">In Review</span>{' '}
              (locked by {period.reviewedByName ?? 'Reviewer'}). Draft amounts and
              adjustments cannot be modified once review begins.
            </>
          ) : (
            <>
              This payroll period is{' '}
              <span className="font-semibold">{period.status}</span>{' '}
              (
              {period.lockedByName
                ? `locked by ${period.lockedByName}`
                : period.approvedByName
                  ? `approved by ${period.approvedByName}`
                  : `submitted by ${period.reviewedByName ?? 'Reviewer'}`}
              ). Entry modifications are frozen in this stage.
            </>
          )}
        </div>
      )}

      {rowError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
        >
          {rowError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Payroll Entries
          </div>
          <div
            data-testid="payroll-kpi-count"
            className="mt-1 text-2xl font-semibold text-slate-900"
          >
            {entries.length}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Flagged for review: {reviewCount}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Gross Pay
          </div>
          <div
            data-testid="payroll-kpi-gross"
            className="mt-1 font-mono text-xl font-semibold text-slate-900"
          >
            {formatPhpFromCentavos(totalGrossCentavos)}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Deductions
          </div>
          <div
            data-testid="payroll-kpi-deductions"
            className="mt-1 font-mono text-xl font-semibold text-slate-900"
          >
            {formatPhpFromCentavos(totalDeductionsCentavos)}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {isDemoMode
              ? 'Statutory tax/contributions disabled'
              : `Includes statutory EE shares (ER cost: ${formatPhpFromCentavos(totalEmployerCostCentavos)})`}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {isDemoMode ? 'Total Draft Net Pay' : 'Total Net Pay'}
          </div>
          <div
            data-testid="payroll-kpi-net"
            className="mt-1 font-mono text-xl font-semibold text-emerald-700"
          >
            {formatPhpFromCentavos(totalNetCentavos)}
          </div>
          {!isDemoMode && (
            <div
              data-testid="payroll-kpi-employer-cost"
              className="mt-1 text-xs text-slate-600"
            >
              Employer Share: {formatPhpFromCentavos(totalEmployerCostCentavos)}
            </div>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            No draft payroll entries generated yet for this period
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Click Generate Draft Payroll on the selected period above after
            configuring employee compensation records.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            aria-label="Draft payroll entries"
            className="min-w-full divide-y divide-slate-200 text-left text-sm"
          >
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2.5">
                  Employee
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Basis &amp; Units
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Gross Pay
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Deductions
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Net Pay
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Warnings &amp; Review
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="font-medium text-slate-900">
                      {entry.employeeName}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {entry.employeeId} · {entry.department}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-700">
                    <div>
                      {entry.payBasis} (
                      {formatPhpFromCentavos(entry.baseCompensationCentavos)})
                    </div>
                    <div className="mt-0.5 text-slate-500">
                      Attendance logs in cutoff: {entry.attendanceSessionsInPeriod}
                    </div>
                    {entry.payBasis !== 'Monthly' && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {isDraftPeriod && canCalculate ? (
                          <>
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Confirmed units for ${entry.employeeId}`}
                              placeholder={
                                entry.confirmedPayableUnitsHundredths !== null
                                  ? formatHundredths(
                                      entry.confirmedPayableUnitsHundredths,
                                    )
                                  : entry.payBasis === 'Daily'
                                    ? 'Days'
                                    : 'Hours'
                              }
                              value={unitInputs[entry.id] ?? ''}
                              onChange={(e) =>
                                setUnitInputs((prev) => ({
                                  ...prev,
                                  [entry.id]: e.target.value,
                                }))
                              }
                              className="w-20 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-900"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleSaveUnits(entry.id)}
                              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Apply Units
                            </button>
                          </>
                        ) : (
                          <span>
                            Confirmed units:{' '}
                            {entry.confirmedPayableUnitsHundredths !== null
                              ? formatHundredths(
                                  entry.confirmedPayableUnitsHundredths,
                                )
                              : 'Unconfirmed'}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-900">
                    {formatPhpFromCentavos(entry.grossPayCentavos)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">
                    {formatPhpFromCentavos(entry.totalDeductionsCentavos)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-3 font-mono font-semibold ${
                      entry.hasNegativeNetPay
                        ? 'text-red-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatPhpFromCentavos(entry.netPayCentavos)}
                  </td>
                  <td className="max-w-xs px-3 py-3 text-xs">
                    {entry.warnings.length === 0 ? (
                      <span className="text-slate-500">None</span>
                    ) : (
                      <ul className="list-disc space-y-1 pl-4 text-amber-800">
                        {entry.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div className="flex flex-col items-start gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPreviewPayslip(entry)}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        Preview Payslip
                      </button>

                      {isDraftPeriod && canCalculate && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            setAdjustingEntryId((cur) =>
                              cur === entry.id ? null : entry.id,
                            )
                          }
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {adjustingEntryId === entry.id
                            ? 'Close Adjustment'
                            : 'Add Adjustment'}
                        </button>
                      )}
                    </div>

                    {adjustingEntryId === entry.id &&
                      isDraftPeriod &&
                      canCalculate && (
                        <div className="mt-2 space-y-2 rounded border border-slate-200 bg-slate-50 p-2.5">
                          <select
                            aria-label={`Adjustment category for ${entry.employeeId}`}
                            value={adjCategory}
                            onChange={(e) =>
                              setAdjCategory(
                                e.target.value as PayrollLineCategory,
                              )
                            }
                            className="block w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="Earning">Earning</option>
                            <option value="Deduction">Deduction</option>
                          </select>
                          {!isDemoMode && adjCategory === 'Earning' && (
                            <select
                              aria-label={`Adjustment taxability for ${entry.employeeId}`}
                              value={adjTaxable}
                              onChange={(e) =>
                                setAdjTaxable(
                                  e.target.value as 'default' | 'taxable' | 'nontaxable',
                                )
                              }
                              className="block w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                            >
                              <option value="default">
                                Taxability Unspecified
                              </option>
                              <option value="taxable">Taxable Earning</option>
                              <option value="nontaxable">
                                Non-Taxable Earning
                              </option>
                            </select>
                          )}
                          <input
                            type="text"
                            aria-label={`Adjustment description for ${entry.employeeId}`}
                            placeholder="Description (e.g. Uniform Allowance)"
                            value={adjLabel}
                            onChange={(e) => setAdjLabel(e.target.value)}
                            className="block w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`Adjustment amount for ${entry.employeeId}`}
                            placeholder="PHP Amount"
                            value={adjAmount}
                            onChange={(e) => setAdjAmount(e.target.value)}
                            className="block w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleSubmitAdjustment(entry.id)
                            }
                            className="w-full rounded bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-800"
                          >
                            Save Adjustment
                          </button>
                        </div>
                      )}
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

