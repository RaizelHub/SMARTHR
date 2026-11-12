import { useCallback, useEffect, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import { formatDateTimeInBusinessZone } from '../features/attendance/utils/timeZone'
import { useAuth } from '../features/auth/authContextStore'
import {
  employeeService as defaultEmployeeService,
  type EmployeeService,
} from '../features/employees/services/employeeService'
import CompensationPanel from '../features/payroll/components/CompensationPanel'
import DraftPayrollTable from '../features/payroll/components/DraftPayrollTable'
import PayrollPeriodsPanel from '../features/payroll/components/PayrollPeriodsPanel'
import PayslipPreviewModal from '../features/payroll/components/PayslipPreviewModal'
import { PHILIPPINE_STATUTORY_PLACEHOLDERS } from '../features/payroll/config/phStatutoryConfig'
import {
  payrollService as defaultPayrollService,
  type PayrollService,
} from '../features/payroll/services/payrollService'
import { formatPhpFromCentavos } from '../features/payroll/utils/money'
import { BUSINESS_TIMEZONE } from '../types/attendance'
import type { Employee } from '../types/employee'
import type {
  AddManualAdjustmentInput,
  CompensationRecord,
  CreateCompensationInput,
  CreatePayrollPeriodInput,
  DraftPayrollGenerationResult,
  PayrollAuditEntry,
  PayrollEntry,
  PayrollPeriod,
  SetConfirmedPayableUnitsInput,
  StatutoryRuleVersionDto,
} from '../types/payroll'

interface PayrollPageProps {
  payService?: PayrollService
  empService?: EmployeeService
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

export default function Payroll({
  payService = defaultPayrollService,
  empService = defaultEmployeeService,
}: PayrollPageProps) {
  const auth = useAuth()
  const actorEmployeeId = auth.actorContext.actorEmployeeId
  const sessionExpiresAtUtc = auth.actorContext.sessionExpiresAtUtc

  const canViewOrgPayroll = auth.hasPermission('payroll.view')
  const canManageComp = auth.hasPermission('compensation.manage')
  const canCreatePeriod = auth.hasPermission('payroll.create')
  const canCalculatePayroll = auth.hasPermission('payroll.calculate')
  const canReviewPayroll = auth.hasPermission('payroll.review')
  const canApprovePayroll = auth.hasPermission('payroll.approve')
  const canLockPayroll = auth.hasPermission('payroll.lock')

  const [employees, setEmployees] = useState<Employee[]>([])
  const [compensations, setCompensations] = useState<CompensationRecord[]>([])
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)
  const [periodEntries, setPeriodEntries] = useState<PayrollEntry[]>([])
  const [myPayslips, setMyPayslips] = useState<PayrollEntry[]>([])
  const [auditEntries, setAuditEntries] = useState<PayrollAuditEntry[]>([])
  const [statutoryRules, setStatutoryRules] = useState<
    StatutoryRuleVersionDto[]
  >([])
  const [lastGenerationResult, setLastGenerationResult] =
    useState<DraftPayrollGenerationResult | null>(null)
  const [previewEntry, setPreviewEntry] = useState<PayrollEntry | null>(null)

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isBusy, setIsBusy] = useState<boolean>(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchWorkspace = useCallback(
    async (preferredPeriodId: string | null) => {
      const actor = { actorEmployeeId, sessionExpiresAtUtc }
      if (!canViewOrgPayroll) {
        const ownSlips = await payService.listMyPayslips(actor)
        return {
          mode: 'self' as const,
          ownSlips,
        }
      }

      const [emps, comps, loadedPeriods, ownSlips, loadedAudit, rules] =
        await Promise.all([
          payService.listDirectoryEmployees
            ? payService.listDirectoryEmployees(actor)
            : empService.listEmployees(actor),
          payService.listCompensationRecords(actor),
          payService.listPayrollPeriods(actor),
          payService.listMyPayslips(actor),
          payService.listPayrollAuditHistory(actor),
          payService.listStatutoryRules
            ? payService.listStatutoryRules(actor)
            : Promise.resolve([] as StatutoryRuleVersionDto[]),
        ])

      const activePeriodId =
        preferredPeriodId &&
        loadedPeriods.some((item) => item.id === preferredPeriodId)
          ? preferredPeriodId
          : (loadedPeriods[0]?.id ?? null)

      const entries = activePeriodId
        ? await payService.listPayrollEntriesForPeriod(activePeriodId, actor)
        : []

      return {
        mode: 'org' as const,
        emps,
        comps,
        loadedPeriods,
        activePeriodId,
        entries,
        ownSlips,
        loadedAudit,
        rules,
      }
    },
    [
      actorEmployeeId,
      canViewOrgPayroll,
      empService,
      payService,
      sessionExpiresAtUtc,
    ],
  )

  useEffect(() => {
    let cancelled = false

    fetchWorkspace(null)
      .then((res) => {
        if (cancelled) return
        if (res.mode === 'self') {
          setMyPayslips(res.ownSlips)
          setEmployees([])
          setCompensations([])
          setPeriods([])
          setSelectedPeriodId(null)
          setPeriodEntries([])
          setAuditEntries([])
        } else {
          setEmployees(res.emps)
          setCompensations(res.comps)
          setPeriods(res.loadedPeriods)
          setSelectedPeriodId(res.activePeriodId)
          setPeriodEntries(res.entries)
          setMyPayslips(res.ownSlips)
          setAuditEntries(res.loadedAudit)
          setStatutoryRules(res.rules)
        }
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            getErrorMessage(error, 'Unable to load payroll workspace.'),
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
  }, [fetchWorkspace])

  const reloadWorkspace = useCallback(
    async (preferredPeriodId: string | null) => {
      const res = await fetchWorkspace(preferredPeriodId)
      if (res.mode === 'self') {
        setMyPayslips(res.ownSlips)
      } else {
        setEmployees(res.emps)
        setCompensations(res.comps)
        setPeriods(res.loadedPeriods)
        setSelectedPeriodId(res.activePeriodId)
        setPeriodEntries(res.entries)
        setMyPayslips(res.ownSlips)
        setAuditEntries(res.loadedAudit)
        setStatutoryRules(res.rules)
      }
    },
    [fetchWorkspace],
  )

  const handleRetryLoad = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setActionError(null)
    try {
      await reloadWorkspace(selectedPeriodId)
    } catch (error: unknown) {
      setLoadError(
        getErrorMessage(error, 'Unable to load payroll workspace.'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [reloadWorkspace, selectedPeriodId])

  const handleSelectPeriod = useCallback(
    async (periodId: string) => {
      setSelectedPeriodId(periodId)
      setPreviewEntry(null)
      setActionError(null)
      try {
        const entries = await payService.listPayrollEntriesForPeriod(
          periodId,
          { actorEmployeeId, sessionExpiresAtUtc },
        )
        setPeriodEntries(entries)
      } catch (error: unknown) {
        setActionError(
          getErrorMessage(error, 'Failed to load payroll entries for period.'),
        )
      }
    },
    [actorEmployeeId, payService, sessionExpiresAtUtc],
  )

  const handleCreateCompensation = useCallback(
    async (input: CreateCompensationInput) => {
      setIsBusy(true)
      setActionError(null)
      setActionSuccess(null)
      try {
        await payService.createCompensationRecord(input, {
          actorEmployeeId,
          sessionExpiresAtUtc,
        })
        await reloadWorkspace(selectedPeriodId)
      } finally {
        setIsBusy(false)
      }
    },
    [
      actorEmployeeId,
      payService,
      reloadWorkspace,
      selectedPeriodId,
      sessionExpiresAtUtc,
    ],
  )

  const handleCreatePeriod = useCallback(
    async (input: CreatePayrollPeriodInput) => {
      setIsBusy(true)
      setActionError(null)
      setActionSuccess(null)
      try {
        const created = await payService.createPayrollPeriod(input, {
          actorEmployeeId,
          sessionExpiresAtUtc,
        })
        setLastGenerationResult(null)
        setPreviewEntry(null)
        await reloadWorkspace(created.id)
      } finally {
        setIsBusy(false)
      }
    },
    [actorEmployeeId, payService, reloadWorkspace, sessionExpiresAtUtc],
  )

  const handleGenerateDraft = useCallback(
    async (periodId: string) => {
      setIsBusy(true)
      setActionError(null)
      setActionSuccess(null)
      try {
        const result = await payService.generateDraftPayroll(periodId, {
          actorEmployeeId,
          sessionExpiresAtUtc,
        })
        setLastGenerationResult(result)
        setPreviewEntry(null)
        await reloadWorkspace(periodId)
        setActionSuccess(
          `Draft payroll ready for ${result.period.label}: ${result.addedCount} created, ${result.preservedExistingCount} preserved, ${result.missingCompensationWarnings.length} missing compensation.`,
        )
      } catch (error: unknown) {
        setActionError(
          getErrorMessage(error, 'Unable to generate draft payroll.'),
        )
      } finally {
        setIsBusy(false)
      }
    },
    [actorEmployeeId, payService, reloadWorkspace, sessionExpiresAtUtc],
  )

  const handleConfirmUnits = useCallback(
    async (input: SetConfirmedPayableUnitsInput) => {
      setIsBusy(true)
      setActionError(null)
      setActionSuccess(null)
      try {
        const updated = await payService.setConfirmedPayableUnits(input, {
          actorEmployeeId,
          sessionExpiresAtUtc,
        })
        if (previewEntry?.id === updated.id) {
          setPreviewEntry(updated)
        }
        await reloadWorkspace(selectedPeriodId)
        setActionSuccess(
          `Updated confirmed payable units for ${updated.employeeName} (${updated.employeeId}).`,
        )
      } finally {
        setIsBusy(false)
      }
    },
    [
      actorEmployeeId,
      payService,
      previewEntry,
      reloadWorkspace,
      selectedPeriodId,
      sessionExpiresAtUtc,
    ],
  )

  const handleAddAdjustment = useCallback(
    async (input: AddManualAdjustmentInput) => {
      setIsBusy(true)
      setActionError(null)
      setActionSuccess(null)
      try {
        const updated = await payService.addManualAdjustment(input, {
          actorEmployeeId,
          sessionExpiresAtUtc,
        })
        if (previewEntry?.id === updated.id) {
          setPreviewEntry(updated)
        }
        await reloadWorkspace(selectedPeriodId)
        setActionSuccess(
          `Applied adjustment to ${updated.employeeName} (${updated.employeeId}).`,
        )
      } finally {
        setIsBusy(false)
      }
    },
    [
      actorEmployeeId,
      payService,
      previewEntry,
      reloadWorkspace,
      selectedPeriodId,
      sessionExpiresAtUtc,
    ],
  )

  const handleMarkInReview = useCallback(
    async (periodId: string) => {
      setIsBusy(true)
      setActionError(null)
      setActionSuccess(null)
      try {
        const updated = await payService.markPeriodInReview(
          periodId,
          undefined,
          { actorEmployeeId, sessionExpiresAtUtc },
        )
        if (previewEntry?.payrollPeriodId === periodId) {
          setPreviewEntry((cur) =>
            cur
              ? {
                  ...cur,
                  status: payService.isDemoMode ? 'In Review' : 'Under Review',
                }
              : null,
          )
        }
        await reloadWorkspace(periodId)
        setActionSuccess(
          payService.isDemoMode
            ? `Marked payroll period "${updated.label}" as In Review. Draft calculations are now locked.`
            : `Submitted payroll period "${updated.label}" (${updated.status}). Entries are now locked for review.`,
        )
      } catch (error: unknown) {
        setActionError(
          getErrorMessage(
            error,
            'Unable to transition payroll period to review.',
          ),
        )
      } finally {
        setIsBusy(false)
      }
    },
    [
      actorEmployeeId,
      payService,
      previewEntry,
      reloadWorkspace,
      sessionExpiresAtUtc,
    ],
  )

  const handleReturnForCorrection = useCallback(
    async (periodId: string, reason: string) => {
      if (!payService.returnPeriodForCorrection) return
      setIsBusy(true)
      setActionError(null)
      setActionSuccess(null)
      try {
        const updated = await payService.returnPeriodForCorrection(
          periodId,
          reason,
          { actorEmployeeId, sessionExpiresAtUtc },
        )
        await reloadWorkspace(periodId)
        setActionSuccess(
          `Returned payroll period "${updated.label}" to ${updated.status} for correction.`,
        )
      } catch (error: unknown) {
        setActionError(
          getErrorMessage(error, 'Unable to return payroll period.'),
        )
      } finally {
        setIsBusy(false)
      }
    },
    [actorEmployeeId, payService, reloadWorkspace, sessionExpiresAtUtc],
  )

  const handleApprovePeriod = useCallback(
    async (periodId: string, notes?: string, expectedVersion?: number) => {
      setIsBusy(true)
      setActionError(null)
      setActionSuccess(null)
      try {
        const updated = await payService.approvePayrollPeriod(
          periodId,
          { actorEmployeeId, sessionExpiresAtUtc },
          notes,
          expectedVersion,
        )
        await reloadWorkspace(periodId)
        setActionSuccess(
          `Approved payroll period "${updated.label}" (Status: ${updated.status}).`,
        )
      } catch (error: unknown) {
        setActionError(
          getErrorMessage(error, 'Unable to approve payroll period.'),
        )
      } finally {
        setIsBusy(false)
      }
    },
    [actorEmployeeId, payService, reloadWorkspace, sessionExpiresAtUtc],
  )

  const handleLockPeriod = useCallback(
    async (periodId: string, expectedVersion?: number) => {
      if (!payService.lockPayrollPeriod) return
      setIsBusy(true)
      setActionError(null)
      setActionSuccess(null)
      try {
        const updated = await payService.lockPayrollPeriod(
          periodId,
          { actorEmployeeId, sessionExpiresAtUtc },
          expectedVersion,
        )
        await reloadWorkspace(periodId)
        setActionSuccess(
          `Locked payroll period "${updated.label}" permanently for auditability.`,
        )
      } catch (error: unknown) {
        setActionError(
          getErrorMessage(error, 'Unable to lock payroll period.'),
        )
      } finally {
        setIsBusy(false)
      }
    },
    [actorEmployeeId, payService, reloadWorkspace, sessionExpiresAtUtc],
  )

  const handleDownloadPdf = useCallback(
    async (entry: PayrollEntry) => {
      if (!payService.downloadPayslipPdf) return
      setIsDownloadingPdf(true)
      setActionError(null)
      try {
        const blob = await payService.downloadPayslipPdf(entry.id, {
          actorEmployeeId,
          sessionExpiresAtUtc,
        })
        if (typeof window !== 'undefined' && typeof URL.createObjectURL === 'function') {
          const blobUrl = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = blobUrl
          link.download = `smarthr-payslip-${entry.employeeId}-${entry.periodEnd}.pdf`
          document.body.appendChild(link)
          link.click()
          link.remove()
          URL.revokeObjectURL(blobUrl)
        }
        setActionSuccess(
          `Downloaded PDF payslip for ${entry.employeeName} (${entry.periodLabel}).`,
        )
      } catch (error: unknown) {
        setActionError(
          getErrorMessage(error, 'Unable to download payslip PDF.'),
        )
      } finally {
        setIsDownloadingPdf(false)
      }
    },
    [actorEmployeeId, payService, sessionExpiresAtUtc],
  )

  const selectedPeriod =
    periods.find((item) => item.id === selectedPeriodId) ?? null

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {canViewOrgPayroll
              ? payService.isDemoMode
                ? 'Payroll Foundation (Phase 6A)'
                : 'Payroll Management & Statutory Compliance'
              : payService.isDemoMode
                ? 'My Draft Payslips'
                : 'My Payslips'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {canViewOrgPayroll
              ? payService.isDemoMode
                ? 'Manage effective-dated compensation, payroll periods, deterministic draft runs, and draft payslip previews.'
                : 'Manage effective-dated compensation, Philippine statutory calculations (SSS, PhilHealth, Pag-IBIG, BIR), maker-checker approvals, and PDF payslips.'
              : 'Inspect your personal payslips in PHP. Organization compensation and coworker payroll data are restricted to HR/Payroll roles.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {payService.isDemoMode ? (
            <div
              role="note"
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <span className="font-medium">Demo-Only Payroll Foundation:</span>{' '}
              No backend payroll API, database, or payment processor is
              connected. Compensation rates, periods, and draft payslips are
              stored in browser{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
                localStorage
              </code>
              .
            </div>
          ) : (
            <div
              role="note"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            >
              <span className="font-medium">Connected Laravel Payroll API:</span>{' '}
              Authenticated API persistence, effective-dated Philippine
              statutory calculations, maker-checker approval workflow, and DomPDF
              payslips are active.
            </div>
          )}

          <div
            role="note"
            className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
          >
            <span className="font-medium text-slate-900">
              Compliance &amp; Approval Boundary:
            </span>{' '}
            {payService.isDemoMode
              ? 'Philippine statutory deductions (SSS, PhilHealth, Pag-IBIG, BIR), automatic overtime/holiday/absence calculations, final approval, and payment disbursement remain disabled pending Phase 6B verification.'
              : 'Verified Philippine statutory tables (SSS Circular 2024-006, PhilHealth 5% UHC, Pag-IBIG Circular 460, BIR RR 11-2018) are active. Payment disbursement and bank transfers remain outside system scope.'}
          </div>
        </div>

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

        {isLoading ? (
          <div
            aria-busy="true"
            className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600"
          >
            Loading payroll workspace...
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800"
          >
            <p className="font-semibold">Unable to load payroll data</p>
            <p className="mt-1">{loadError}</p>
            <button
              type="button"
              onClick={() => void handleRetryLoad()}
              className="mt-3 rounded-md border border-red-300 bg-white px-3.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {previewEntry && (
              <PayslipPreviewModal
                entry={previewEntry}
                isDownloadingPdf={isDownloadingPdf}
                onDownloadPdf={
                  !payService.isDemoMode && payService.downloadPayslipPdf
                    ? handleDownloadPdf
                    : undefined
                }
                onClose={() => setPreviewEntry(null)}
              />
            )}

            {canViewOrgPayroll && (
              <>
                <CompensationPanel
                  employees={employees}
                  compensations={compensations}
                  canManage={canManageComp}
                  isDemoMode={payService.isDemoMode}
                  isLoading={isLoading}
                  isBusy={isBusy}
                  onCreateCompensation={handleCreateCompensation}
                />

                <PayrollPeriodsPanel
                  periods={periods}
                  selectedPeriodId={selectedPeriodId}
                  lastGenerationResult={lastGenerationResult}
                  canCreate={canCreatePeriod}
                  canCalculate={canCalculatePayroll}
                  canReview={canReviewPayroll}
                  canApprove={canApprovePayroll}
                  canLock={canLockPayroll}
                  isDemoMode={payService.isDemoMode}
                  isBusy={isBusy}
                  onSelectPeriod={(id) => void handleSelectPeriod(id)}
                  onCreatePeriod={handleCreatePeriod}
                  onGenerateDraft={handleGenerateDraft}
                  onMarkInReview={handleMarkInReview}
                  onReturnForCorrection={
                    payService.returnPeriodForCorrection
                      ? handleReturnForCorrection
                      : undefined
                  }
                  onApprovePeriod={handleApprovePeriod}
                  onLockPeriod={
                    payService.lockPayrollPeriod ? handleLockPeriod : undefined
                  }
                />

                <DraftPayrollTable
                  period={selectedPeriod}
                  entries={periodEntries}
                  canCalculate={canCalculatePayroll}
                  isDemoMode={payService.isDemoMode}
                  isBusy={isBusy}
                  onConfirmUnits={handleConfirmUnits}
                  onAddAdjustment={handleAddAdjustment}
                  onPreviewPayslip={setPreviewEntry}
                />
              </>
            )}

            <section
              aria-labelledby="my-payslips-heading"
              className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
            >
              <div className="border-b border-slate-200 pb-4">
                <h2
                  id="my-payslips-heading"
                  className="text-lg font-semibold text-slate-900"
                >
                  {payService.isDemoMode
                    ? 'My Personal Draft Payslips'
                    : 'My Personal Payslips'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Self-service payslip records issued for your employee account
                  only.
                </p>
              </div>

              {myPayslips.length === 0 ? (
                <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-800">
                    {payService.isDemoMode
                      ? 'No personal draft payslips generated yet'
                      : 'No personal payslips available yet'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Payslips appear here once HR/Payroll configures your
                    compensation and runs a payroll period.
                  </p>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table
                    aria-label="My draft payslips"
                    className="min-w-full divide-y divide-slate-200 text-left text-sm"
                  >
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th scope="col" className="px-3 py-2.5">
                          Period
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Pay Date
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
                          Status
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {myPayslips.map((slip) => (
                        <tr key={slip.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-900">
                              {slip.periodLabel}
                            </div>
                            <div className="font-mono text-xs text-slate-500">
                              {slip.periodStart} to {slip.periodEnd}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-700">
                            {slip.payDate}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-900">
                            {formatPhpFromCentavos(slip.grossPayCentavos)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-700">
                            {formatPhpFromCentavos(
                              slip.totalDeductionsCentavos,
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold text-emerald-700">
                            {formatPhpFromCentavos(slip.netPayCentavos)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                              {payService.isDemoMode
                                ? `DRAFT · ${slip.status}`
                                : slip.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPreviewEntry(slip)}
                                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              >
                                Preview My Payslip
                              </button>
                              {!payService.isDemoMode &&
                                payService.downloadPayslipPdf && (
                                  <button
                                    type="button"
                                    disabled={isDownloadingPdf}
                                    onClick={() => void handleDownloadPdf(slip)}
                                    className="rounded-md bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                                  >
                                    Download PDF
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {canViewOrgPayroll && (
              <>
                <section
                  aria-labelledby="ph-compliance-heading"
                  className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
                >
                  <div className="border-b border-slate-200 pb-4">
                    <h2
                      id="ph-compliance-heading"
                      className="text-lg font-semibold text-slate-900"
                    >
                      {payService.isDemoMode
                        ? 'Philippine Payroll Compliance Readiness (Phase 6B)'
                        : 'Verified Philippine Statutory Rules (Active)'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {payService.isDemoMode
                        ? 'Automatic statutory deductions are intentionally disabled until current agency circulars, salary brackets, and company policies are independently verified.'
                        : 'Effective-dated Philippine statutory contribution and withholding rules loaded from Laravel PostgreSQL-compatible rule versions.'}
                    </p>
                  </div>

                  {!payService.isDemoMode && statutoryRules.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {statutoryRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">
                              {rule.agency} — {rule.rule_key}
                            </h3>
                            <span className="rounded border border-emerald-300 bg-white px-2 py-0.5 text-xs font-medium text-emerald-800">
                              Active · Effective {rule.effective_from}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-700">
                            Issuance: {rule.issuance_reference}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Official source:{' '}
                            <a
                              href={rule.official_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-700 underline hover:text-blue-900"
                            >
                              {rule.official_url}
                            </a>
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {PHILIPPINE_STATUTORY_PLACEHOLDERS.map((item) => (
                        <div
                          key={item.agencyCode}
                          className="rounded-md border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">
                              {item.agencyName}
                            </h3>
                            <span className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                              {item.statusLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {item.scope}
                          </p>
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                            {item.requiredVerificationItems.map((req, idx) => (
                              <li key={idx}>{req}</li>
                            ))}
                          </ul>
                          <p className="mt-2 text-xs text-slate-500">
                            Official reference:{' '}
                            <a
                              href={item.officialUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-700 underline hover:text-blue-900"
                            >
                              {item.officialUrl}
                            </a>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section
                  aria-labelledby="payroll-audit-heading"
                  className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
                >
                  <div className="border-b border-slate-200 pb-4">
                    <h2
                      id="payroll-audit-heading"
                      className="text-lg font-semibold text-slate-900"
                    >
                      Payroll Audit History
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Tracks compensation setups, payroll period creation, draft
                      generation, unit confirmations, adjustments, and review
                      locks.
                    </p>
                  </div>

                  {auditEntries.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-600">
                      No payroll audit events recorded yet.
                    </p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table
                        aria-label="Payroll audit history"
                        className="min-w-full divide-y divide-slate-200 text-left text-xs"
                      >
                        <thead className="bg-slate-50 font-semibold uppercase tracking-wide text-slate-600">
                          <tr>
                            <th scope="col" className="px-3 py-2">
                              Timestamp ({BUSINESS_TIMEZONE})
                            </th>
                            <th scope="col" className="px-3 py-2">
                              Event
                            </th>
                            <th scope="col" className="px-3 py-2">
                              Actor
                            </th>
                            <th scope="col" className="px-3 py-2">
                              Target Employee
                            </th>
                            <th scope="col" className="px-3 py-2">
                              Summary
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {auditEntries.map((entry) => (
                            <tr key={entry.id}>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                                {formatDateTimeInBusinessZone(
                                  entry.timestampUtc,
                                  BUSINESS_TIMEZONE,
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 font-mono font-medium text-blue-800">
                                {entry.eventType}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                                {entry.actorName} ({entry.actorRole})
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-700">
                                {entry.targetEmployeeId ?? '—'}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {entry.summary}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

