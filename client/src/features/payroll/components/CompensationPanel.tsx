import { useState, type FormEvent } from 'react'
import type { Employee } from '../../../types/employee'
import {
  PAY_BASES,
  type CompensationRecord,
  type CreateCompensationInput,
  type PayBasis,
} from '../../../types/payroll'
import { formatPhpFromCentavos } from '../utils/money'

interface CompensationPanelProps {
  employees: readonly Employee[]
  compensations: readonly CompensationRecord[]
  canManage: boolean
  isDemoMode?: boolean
  isLoading: boolean
  isBusy: boolean
  onCreateCompensation: (input: CreateCompensationInput) => Promise<void>
}

interface AllowanceDraft {
  label: string
  amountInput: string
  taxable: boolean | null
}

export default function CompensationPanel({
  employees,
  compensations,
  canManage,
  isDemoMode = true,
  isLoading,
  isBusy,
  onCreateCompensation,
}: CompensationPanelProps) {
  const [employeeId, setEmployeeId] = useState<string>('')
  const [payBasis, setPayBasis] = useState<PayBasis>('Monthly')
  const [baseAmountInput, setBaseAmountInput] = useState<string>('')
  const [statutoryEligible, setStatutoryEligible] = useState<boolean>(true)
  const [effectiveDate, setEffectiveDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [allowances, setAllowances] = useState<AllowanceDraft[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const eligibleEmployees = employees.filter(
    (emp) => emp.employmentStatus !== 'Inactive',
  )

  function handleAddAllowanceRow() {
    setAllowances((prev) => [
      ...prev,
      { label: '', amountInput: '', taxable: null },
    ])
  }

  function handleUpdateAllowanceRow(
    index: number,
    field: 'label' | 'amountInput' | 'taxable',
    value: string | boolean | null,
  ) {
    setAllowances((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    )
  }

  function handleRemoveAllowanceRow(index: number) {
    setAllowances((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setFormSuccess(null)

    try {
      await onCreateCompensation({
        employeeId,
        payBasis,
        baseAmountInput,
        allowances,
        statutoryEligible,
        effectiveDate,
        endDate: endDate || undefined,
        notes: notes || undefined,
      })
      setBaseAmountInput('')
      setStatutoryEligible(true)
      setEndDate('')
      setNotes('')
      setAllowances([])
      setFormSuccess(
        `Saved ${payBasis} compensation record for ${employeeId} effective ${effectiveDate}.`,
      )
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Unable to save compensation record.',
      )
    }
  }

  return (
    <section
      aria-labelledby="compensation-management-heading"
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="border-b border-slate-200 pb-4">
        <h2
          id="compensation-management-heading"
          className="text-lg font-semibold text-slate-900"
        >
          Employee Compensation Records
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Configure effective-dated PHP base rates and recurring allowances.
          Historical compensation records remain preserved for auditability and
          prior payroll runs.
        </p>
      </div>

      {canManage && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          aria-label="Create employee compensation"
          className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">
            Add Effective-Dated Compensation
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label
                htmlFor="comp-employee-id"
                className="block text-xs font-medium text-slate-700"
              >
                Employee
              </label>
              <select
                id="comp-employee-id"
                value={employeeId}
                disabled={isBusy}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="">Select employee...</option>
                {eligibleEmployees.map((emp) => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {emp.fullName} ({emp.employeeId} · {emp.department})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="comp-pay-basis"
                className="block text-xs font-medium text-slate-700"
              >
                Pay Basis
              </label>
              <select
                id="comp-pay-basis"
                value={payBasis}
                disabled={isBusy}
                onChange={(e) => setPayBasis(e.target.value as PayBasis)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {PAY_BASES.map((basis) => (
                  <option key={basis} value={basis}>
                    {basis}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="comp-base-amount"
                className="block text-xs font-medium text-slate-700"
              >
                Base Amount (PHP)
              </label>
              <input
                id="comp-base-amount"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 30000.00"
                value={baseAmountInput}
                disabled={isBusy}
                onChange={(e) => setBaseAmountInput(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="comp-effective-date"
                className="block text-xs font-medium text-slate-700"
              >
                Effective Date
              </label>
              <input
                id="comp-effective-date"
                type="date"
                value={effectiveDate}
                disabled={isBusy}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="comp-end-date"
                className="block text-xs font-medium text-slate-700"
              >
                End Date (Optional)
              </label>
              <input
                id="comp-end-date"
                type="date"
                value={endDate}
                disabled={isBusy}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="comp-notes"
                className="block text-xs font-medium text-slate-700"
              >
                Notes (Optional)
              </label>
              <input
                id="comp-notes"
                type="text"
                placeholder="Reason or effective notice"
                value={notes}
                disabled={isBusy}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-3">
            {!isDemoMode && (
              <div className="mb-2 flex items-center gap-2">
                <input
                  id="comp-statutory-eligible"
                  type="checkbox"
                  checked={statutoryEligible}
                  disabled={isBusy}
                  onChange={(e) => setStatutoryEligible(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <label
                  htmlFor="comp-statutory-eligible"
                  className="text-xs font-medium text-slate-700"
                >
                  Eligible for Automatic Philippine Statutory Contributions (SSS, PhilHealth, Pag-IBIG, BIR)
                </label>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">
                Configured Allowances (Optional)
              </span>
              <button
                type="button"
                onClick={handleAddAllowanceRow}
                disabled={isBusy}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                + Add Allowance
              </button>
            </div>

            {allowances.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 sm:grid-cols-12"
              >
                <input
                  type="text"
                  aria-label={`Allowance label ${idx + 1}`}
                  placeholder="Allowance label (e.g. Rice Subsidy)"
                  value={item.label}
                  onChange={(e) =>
                    handleUpdateAllowanceRow(idx, 'label', e.target.value)
                  }
                  className={`rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 ${
                    isDemoMode ? 'sm:col-span-6' : 'sm:col-span-4'
                  }`}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`Allowance amount ${idx + 1}`}
                  placeholder="Amount (PHP)"
                  value={item.amountInput}
                  onChange={(e) =>
                    handleUpdateAllowanceRow(idx, 'amountInput', e.target.value)
                  }
                  className={`rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 ${
                    isDemoMode ? 'sm:col-span-4' : 'sm:col-span-3'
                  }`}
                />
                {!isDemoMode && (
                  <select
                    aria-label={`Allowance taxability ${idx + 1}`}
                    value={
                      item.taxable === null
                        ? 'unspecified'
                        : item.taxable
                          ? 'taxable'
                          : 'nontaxable'
                    }
                    onChange={(e) => {
                      const val = e.target.value
                      handleUpdateAllowanceRow(
                        idx,
                        'taxable',
                        val === 'unspecified' ? null : val === 'taxable',
                      )
                    }}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 sm:col-span-3"
                  >
                    <option value="unspecified">Taxability Unspecified (Review)</option>
                    <option value="taxable">Taxable</option>
                    <option value="nontaxable">Non-Taxable (De Minimis)</option>
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveAllowanceRow(idx)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 sm:col-span-2"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {isBusy ? 'Saving...' : 'Save Compensation Record'}
            </button>
          </div>
        </form>
      )}

      {!isLoading && compensations.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            No compensation records configured yet
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Smart HR never invents employee salaries. Add effective-dated
            synthetic or authorized compensation rates above before running
            draft payroll.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            aria-label="Employee compensation history"
            className="min-w-full divide-y divide-slate-200 text-left text-sm"
          >
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2.5">
                  Employee
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Pay Basis
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Base Rate (PHP)
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Configured Allowances
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Effective Range
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {compensations.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="font-medium text-slate-900">
                      {rec.employeeName}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {rec.employeeId} · {rec.department}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                    {rec.payBasis}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono font-medium text-slate-900">
                    {formatPhpFromCentavos(rec.baseAmountCentavos)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">
                    {rec.allowances.length === 0
                      ? 'None'
                      : rec.allowances
                          .map(
                            (a) =>
                              `${a.label}: ${formatPhpFromCentavos(a.amountCentavos)}`,
                          )
                          .join(', ')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-700">
                    {rec.effectiveDate} to {rec.endDate ?? 'Present'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className={
                        rec.status === 'Active'
                          ? 'inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800'
                          : 'inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700'
                      }
                    >
                      {rec.status}
                    </span>
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

