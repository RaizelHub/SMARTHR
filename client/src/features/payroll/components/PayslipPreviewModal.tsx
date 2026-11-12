import type { PayrollEntry } from '../../../types/payroll'
import { formatPhpFromCentavos } from '../utils/money'

interface PayslipPreviewModalProps {
  entry: PayrollEntry
  isDownloadingPdf?: boolean
  onDownloadPdf?: (entry: PayrollEntry) => Promise<void>
  onClose: () => void
}

export default function PayslipPreviewModal({
  entry,
  isDownloadingPdf = false,
  onDownloadPdf,
  onClose,
}: PayslipPreviewModalProps) {
  function handlePrint() {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print()
    }
  }

  const statutoryEnabled = Boolean(entry.ruleSnapshot.statutoryDeductionsEnabled)
  const isFinalized = entry.status === 'Approved' || entry.status === 'Locked'
  const employerCosts = entry.employerCosts ?? []
  const totalEmployerCost = entry.totalEmployerCostCentavos ?? 0

  return (
    <section
      aria-labelledby="payslip-preview-heading"
      data-testid="payslip-preview-panel"
      className="space-y-5 rounded-lg border-2 border-slate-300 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="payslip-draft-watermark"
              className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold tracking-wide ${
                statutoryEnabled && isFinalized
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-red-300 bg-red-50 text-red-800'
              }`}
            >
              {!statutoryEnabled
                ? 'DRAFT / NOT FOR PAYMENT'
                : isFinalized
                  ? 'APPROVED PAYSLIP · INTERNAL RECORD (NO DISBURSEMENT)'
                  : 'PRE-APPROVAL PAYSLIP · NOT FOR PAYMENT'}
            </span>
            <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              Status: {entry.status}
            </span>
          </div>
          <h2
            id="payslip-preview-heading"
            className="mt-2 text-lg font-semibold text-slate-900"
          >
            {statutoryEnabled
              ? 'Smart HR — Employee Payslip'
              : 'Smart HR Demo Organization — Draft Payslip Preview'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            {statutoryEnabled
              ? 'Philippine statutory contributions and BIR withholding calculated by Smart HR backend. Payment disbursement is external.'
              : 'Subject to verified Phase 6B approval policy and statutory rules before official issuance or disbursement.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onDownloadPdf && (
            <button
              type="button"
              disabled={isDownloadingPdf}
              onClick={() => void onDownloadPdf(entry)}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {isDownloadingPdf ? 'Generating PDF...' : 'Download PDF'}
            </button>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Print Preview
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-600"
          >
            Close Payslip
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-slate-500">Employee Name</dt>
          <dd className="font-semibold text-slate-900">{entry.employeeName}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Employee ID</dt>
          <dd className="font-mono text-slate-900">{entry.employeeId}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Department</dt>
          <dd className="text-slate-900">{entry.department}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Payroll Period</dt>
          <dd className="text-slate-900">
            {entry.periodLabel} ({entry.periodStart} to {entry.periodEnd})
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Pay Date</dt>
          <dd className="font-mono text-slate-900">{entry.payDate}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">
            Pay Basis &amp; Schedule
          </dt>
          <dd className="text-slate-900">
            {entry.payBasis} · {entry.scheduleType} ({entry.currency})
          </dd>
        </div>
      </dl>

      {entry.hasNegativeNetPay && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          Review Required: Negative net pay detected (total deductions exceed
          gross pay).
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Earnings</h3>
          <table
            aria-label="Payslip earnings"
            className="mt-3 min-w-full divide-y divide-slate-200 text-left text-xs"
          >
            <thead className="bg-slate-50 font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-2.5 py-2">
                  Description
                </th>
                <th scope="col" className="px-2.5 py-2">
                  Source
                </th>
                <th scope="col" className="px-2.5 py-2 text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {entry.earnings.map((line) => (
                <tr key={line.id}>
                  <td className="px-2.5 py-2 font-medium text-slate-800">
                    {line.label}
                  </td>
                  <td className="px-2.5 py-2 text-slate-600">{line.source}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-slate-900">
                    {formatPhpFromCentavos(line.amountCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td colSpan={2} className="px-2.5 py-2 text-slate-900">
                  Gross Pay
                </td>
                <td
                  data-testid="payslip-gross-pay"
                  className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-slate-900"
                >
                  {formatPhpFromCentavos(entry.grossPayCentavos)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Deductions</h3>
          <table
            aria-label="Payslip deductions"
            className="mt-3 min-w-full divide-y divide-slate-200 text-left text-xs"
          >
            <thead className="bg-slate-50 font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-2.5 py-2">
                  Description
                </th>
                <th scope="col" className="px-2.5 py-2">
                  Source
                </th>
                <th scope="col" className="px-2.5 py-2 text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {entry.deductions.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2.5 py-4 text-slate-500">
                    {statutoryEnabled
                      ? 'No statutory or authorized deductions for this cutoff.'
                      : 'No authorized deductions applied. Statutory Philippine deductions (SSS, PhilHealth, Pag-IBIG, BIR) are disabled pending Phase 6B verification.'}
                  </td>
                </tr>
              ) : (
                entry.deductions.map((line) => (
                  <tr key={line.id}>
                    <td className="px-2.5 py-2 font-medium text-slate-800">
                      {line.label}
                    </td>
                    <td className="px-2.5 py-2 text-slate-600">
                      {line.source}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-slate-900">
                      {formatPhpFromCentavos(line.amountCentavos)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td colSpan={2} className="px-2.5 py-2 text-slate-900">
                  Total Deductions
                </td>
                <td
                  data-testid="payslip-total-deductions"
                  className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-slate-900"
                >
                  {formatPhpFromCentavos(entry.totalDeductionsCentavos)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {employerCosts.length > 0 && (
        <div
          data-testid="payslip-employer-costs"
          className="rounded-md border border-slate-200 bg-slate-50 p-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">
            Employer Statutory Shares (Company Cost — Not Deducted from Employee Pay)
          </h3>
          <table
            aria-label="Employer statutory shares"
            className="mt-2 min-w-full divide-y divide-slate-200 text-left text-xs"
          >
            <thead className="bg-slate-100 font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-2.5 py-2">
                  Contribution
                </th>
                <th scope="col" className="px-2.5 py-2">
                  Source
                </th>
                <th scope="col" className="px-2.5 py-2 text-right">
                  Employer Share
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {employerCosts.map((line) => (
                <tr key={line.id}>
                  <td className="px-2.5 py-2 font-medium text-slate-800">
                    {line.label}
                  </td>
                  <td className="px-2.5 py-2 text-slate-600">{line.source}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-slate-900">
                    {formatPhpFromCentavos(line.amountCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
                <td colSpan={2} className="px-2.5 py-2 text-slate-900">
                  Total Employer Statutory Cost
                </td>
                <td className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-slate-900">
                  {formatPhpFromCentavos(totalEmployerCost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-300 bg-slate-50 px-4 py-3">
        <div className="text-xs text-slate-600">
          Calculation Engine: {entry.ruleSnapshot.engineVersion} ·{' '}
          {entry.ruleSnapshot.calculationMethod} ·{' '}
          {entry.ruleSnapshot.roundingMode} (Rule date{' '}
          {entry.ruleSnapshot.asOfDate ?? entry.ruleSnapshot.ruleVersionDate})
        </div>
        <div className="text-right">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            {statutoryEnabled ? 'Net Pay' : 'Net Pay (Draft)'}
          </span>
          <span
            data-testid="payslip-net-pay"
            className={`font-mono text-xl font-bold ${
              entry.hasNegativeNetPay ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {formatPhpFromCentavos(entry.netPayCentavos)}
          </span>
        </div>
      </div>
    </section>
  )
}

