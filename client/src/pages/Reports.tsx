import { useCallback, useEffect, useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import { useAuth } from '../features/auth/authContextStore'
import AttendanceAnalyticsSection from '../features/reports/components/AttendanceAnalyticsSection'
import LeaveAnalyticsSection from '../features/reports/components/LeaveAnalyticsSection'
import ReportFiltersBar from '../features/reports/components/ReportFiltersBar'
import WorkforceAnalyticsSection from '../features/reports/components/WorkforceAnalyticsSection'
import {
  reportService as defaultReportService,
  ReportServiceError,
  type ReportService,
} from '../features/reports/services/reportService'
import { triggerCsvDownload } from '../features/reports/utils/csvExport'
import { BUSINESS_TIMEZONE } from '../types/attendance'
import type {
  CsvExportDataset,
  ReportFilterInput,
  WorkforceReport,
} from '../types/report'

interface ReportsPageProps {
  rptService?: ReportService
}

const DEFAULT_FILTERS: Required<ReportFilterInput> = {
  startDate: '',
  endDate: '',
  department: 'All',
  employeeId: 'All',
  employmentStatus: 'All',
  leaveStatus: 'All',
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

export default function Reports({
  rptService = defaultReportService,
}: ReportsPageProps) {
  const auth = useAuth()
  const actingEmployee = auth.currentUser
  const actorEmployeeId = auth.actorContext.actorEmployeeId
  const sessionExpiresAtUtc = auth.actorContext.sessionExpiresAtUtc

  const [filters, setFilters] =
    useState<Required<ReportFilterInput>>(DEFAULT_FILTERS)
  const [report, setReport] = useState<WorkforceReport | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filterValidationError, setFilterValidationError] = useState<
    string | null
  >(null)

  const [exportingDataset, setExportingDataset] =
    useState<CsvExportDataset | null>(null)
  const [exportFeedback, setExportFeedback] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)

  const [workforcePage, setWorkforcePage] = useState<number>(1)
  const [attendancePage, setAttendancePage] = useState<number>(1)
  const [leavePage, setLeavePage] = useState<number>(1)

  useEffect(() => {
    let cancelled = false

    rptService
      .generateReport(filters, {
        actorEmployeeId,
        sessionExpiresAtUtc,
      })
      .then((generated) => {
        if (!cancelled) {
          setReport(generated)
          setLoadError(null)
          setFilterValidationError(null)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        const message = getErrorMessage(
          error,
          'Unable to generate HR analytics report.',
        )
        if (
          error instanceof ReportServiceError &&
          error.code === 'VALIDATION_ERROR'
        ) {
          setFilterValidationError(message)
        } else {
          setLoadError(message)
          setFilterValidationError(null)
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
  }, [actorEmployeeId, filters, rptService, sessionExpiresAtUtc])

  const handleFiltersChange = useCallback(
    (nextFilters: Required<ReportFilterInput>) => {
      setIsLoading(true)
      setFilterValidationError(null)
      setExportFeedback(null)
      setWorkforcePage(1)
      setAttendancePage(1)
      setLeavePage(1)
      setFilters(nextFilters)
    },
    [],
  )

  const handleResetFilters = useCallback(() => {
    setIsLoading(true)
    setFilterValidationError(null)
    setExportFeedback(null)
    setWorkforcePage(1)
    setAttendancePage(1)
    setLeavePage(1)
    setFilters(DEFAULT_FILTERS)
  }, [])

  const handleRetryLoad = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setFilterValidationError(null)
    setExportFeedback(null)
    try {
      const generated = await rptService.generateReport(filters, {
        actorEmployeeId,
        sessionExpiresAtUtc,
      })
      setReport(generated)
    } catch (error: unknown) {
      const message = getErrorMessage(
        error,
        'Unable to generate HR analytics report.',
      )
      if (
        error instanceof ReportServiceError &&
        error.code === 'VALIDATION_ERROR'
      ) {
        setFilterValidationError(message)
      } else {
        setLoadError(message)
      }
    } finally {
      setIsLoading(false)
    }
  }, [actorEmployeeId, filters, rptService, sessionExpiresAtUtc])

  const handleExportCsv = useCallback(
    async (dataset: CsvExportDataset) => {
      setExportingDataset(dataset)
      setExportFeedback(null)
      try {
        const result = await rptService.exportReportCsv(dataset, filters, {
          actorEmployeeId,
          sessionExpiresAtUtc,
        })
        triggerCsvDownload(result.filename, result.csvContent)
        setExportFeedback({
          kind: 'success',
          message: `Exported ${result.rowCount} ${result.dataset} row${result.rowCount === 1 ? '' : 's'} to ${result.filename}.`,
        })
      } catch (error: unknown) {
        setExportFeedback({
          kind: 'error',
          message: getErrorMessage(
            error,
            `Failed to export ${dataset} CSV report.`,
          ),
        })
      } finally {
        setExportingDataset(null)
      }
    },
    [actorEmployeeId, filters, rptService, sessionExpiresAtUtc],
  )

  const authorizedScope = report
    ? report.authorizedScope
    : auth.hasPermission('reports.view_all')
      ? 'all'
      : auth.hasPermission('reports.view_team')
        ? 'team'
        : 'own'

  const scopeBannerText =
    authorizedScope === 'all'
      ? 'Organization Scope — Viewing workforce, attendance, and leave analytics across all departments.'
      : authorizedScope === 'team'
        ? `Team Scope (${actingEmployee?.department ?? ''}) — Analytics and exports are restricted strictly to your assigned department.`
        : 'Personal Scope — Viewing analytics for your own employee record only. Bulk CSV export is restricted to Managers and HR personnel.'

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Reports &amp; Analytics
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Live aggregations derived directly from registered employee,
              attendance, and leave datasets in {BUSINESS_TIMEZONE}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rptService.isDemoMode && (
            <div
              role="note"
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <span className="font-medium">Demo-Only Client Analytics:</span>{' '}
              No backend SQL reporting API is connected. Figures and CSV exports
              are computed locally from browser{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
                localStorage
              </code>
              .
            </div>
          )}

          <div
            role="note"
            data-testid="report-scope-banner"
            className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
          >
            <span className="font-medium">Authorized Reporting Scope:</span>{' '}
            {scopeBannerText}
          </div>
        </div>

        {exportFeedback && (
          <div
            role={exportFeedback.kind === 'error' ? 'alert' : 'status'}
            className={
              exportFeedback.kind === 'error'
                ? 'rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800'
                : 'flex items-start justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
            }
          >
            <span>{exportFeedback.message}</span>
            {exportFeedback.kind === 'success' && (
              <button
                type="button"
                onClick={() => setExportFeedback(null)}
                className="rounded px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        <ReportFiltersBar
          filters={filters}
          authorizedScope={authorizedScope}
          availableDepartments={
            report?.availableDepartments ??
            (actingEmployee ? [actingEmployee.department] : [])
          }
          availableEmployees={report?.availableEmployees ?? []}
          isLoading={isLoading}
          filterValidationError={filterValidationError}
          onFiltersChange={handleFiltersChange}
          onResetFilters={handleResetFilters}
        />

        {isLoading && !report && (
          <div
            aria-busy="true"
            className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600"
          >
            Generating workforce, attendance, and leave analytics...
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800"
          >
            <p className="font-semibold">Unable to generate HR report</p>
            <p className="mt-1">{loadError}</p>
            <button
              type="button"
              onClick={() => void handleRetryLoad()}
              className="mt-3 rounded-md border border-red-300 bg-white px-3.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              Retry
            </button>
          </div>
        )}

        {report && !loadError && (
          <div className="space-y-6">
            <WorkforceAnalyticsSection
              data={report.employeeAnalytics}
              canExport={report.canExport}
              exportingDataset={exportingDataset}
              page={workforcePage}
              onPageChange={setWorkforcePage}
              onExportCsv={() => void handleExportCsv('employees')}
            />

            <AttendanceAnalyticsSection
              data={report.attendanceAnalytics}
              canExport={report.canExport}
              exportingDataset={exportingDataset}
              page={attendancePage}
              onPageChange={setAttendancePage}
              onExportCsv={() => void handleExportCsv('attendance')}
            />

            <LeaveAnalyticsSection
              data={report.leaveAnalytics}
              canExport={report.canExport}
              exportingDataset={exportingDataset}
              page={leavePage}
              onPageChange={setLeavePage}
              onExportCsv={() => void handleExportCsv('leave')}
            />

            <section
              aria-labelledby="metric-definitions-heading"
              className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
            >
              <h2
                id="metric-definitions-heading"
                className="text-base font-semibold text-slate-900"
              >
                Metric Definitions &amp; Calculation Rules
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Absence/tardiness schedules, payable hours mapping, and leave
                balance entitlements remain unconfigured pending formal HR policy
                rules.
              </p>
              <dl className="mt-4 divide-y divide-slate-200 text-sm">
                {report.metricDefinitions.map((item) => (
                  <div
                    key={item.metric}
                    className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-3 sm:gap-4"
                  >
                    <dt className="font-medium text-slate-900">{item.metric}</dt>
                    <dd className="text-slate-600 sm:col-span-2">
                      {item.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

