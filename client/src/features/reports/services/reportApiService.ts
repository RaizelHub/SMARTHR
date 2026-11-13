import type { AxiosInstance } from 'axios'
import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import type {
  CsvExportDataset,
  CsvExportResult,
  ReportFilterInput,
  WorkforceReport,
} from '../../../types/report'
import { ApiClientError, createApiHttpClient } from '../../api/httpClient'
import {
  DEFAULT_MAX_EXPORT_ROWS,
  ReportServiceError,
  type ReportService,
  type ReportServiceErrorCode,
} from './reportService'

export interface ApiReportServiceOptions {
  httpClient?: AxiosInstance
}

function mapErrorCode(code: string, status: number): ReportServiceErrorCode {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'EMPLOYEE_INACTIVE':
    case 'VALIDATION_ERROR':
    case 'EXPORT_LIMIT_EXCEEDED':
    case 'PERSISTENCE_ERROR':
      return code
    default:
      if (status === 401 || status === 403) return 'UNAUTHORIZED'
      if (status === 400 || status === 422) return 'VALIDATION_ERROR'
      return 'PERSISTENCE_ERROR'
  }
}

function mapHttpStatus(status: number): 400 | 401 | 403 | 500 {
  if (status === 400 || status === 401 || status === 403) {
    return status
  }
  if (status === 422) return 400
  return 500
}

function rethrowAsReportError(error: unknown, fallback: string): never {
  if (error instanceof ReportServiceError) {
    throw error
  }
  if (error instanceof ApiClientError) {
    throw new ReportServiceError(
      mapErrorCode(error.code, error.httpStatus),
      error.message,
      mapHttpStatus(error.httpStatus),
    )
  }
  throw new ReportServiceError(
    'PERSISTENCE_ERROR',
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : fallback,
    500,
  )
}

function buildFilterParams(
  filters: ReportFilterInput | undefined,
): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters?.startDate) params.startDate = filters.startDate
  if (filters?.endDate) params.endDate = filters.endDate
  if (filters?.department) params.department = filters.department
  if (filters?.employeeId) params.employeeId = filters.employeeId
  if (filters?.employmentStatus) {
    params.employmentStatus = filters.employmentStatus
  }
  if (filters?.leaveStatus) params.leaveStatus = filters.leaveStatus
  return params
}

export function createApiReportService(
  options: ApiReportServiceOptions = {},
): ReportService {
  const client = options.httpClient ?? createApiHttpClient()

  return {
    isDemoMode: false,
    businessTimezone: BUSINESS_TIMEZONE,
    maxExportRows: DEFAULT_MAX_EXPORT_ROWS,

    invalidateCache(): void {
      // Backend report queries execute directly against indexed database tables.
    },

    async generateReport(
      filters: ReportFilterInput | undefined,
    ): Promise<WorkforceReport> {
      try {
        const res = await client.get<{ report: WorkforceReport }>(
          '/reports/summary',
          {
            params: buildFilterParams(filters),
          },
        )
        return res.data.report
      } catch (error) {
        rethrowAsReportError(error, 'Failed to generate workforce analytics report.')
      }
    },

    async exportReportCsv(
      dataset: CsvExportDataset,
      filters: ReportFilterInput | undefined,
    ): Promise<CsvExportResult> {
      try {
        const res = await client.get<string>(
          `/reports/export/${encodeURIComponent(dataset)}`,
          {
            params: buildFilterParams(filters),
            responseType: 'text',
          },
        )

        const contentDisposition = String(
          res.headers?.['content-disposition'] ?? '',
        )
        const filenameMatch = /filename="?([^"]+)"?/.exec(contentDisposition)
        const rowCountHeader = Number(res.headers?.['x-export-row-count'] ?? '')
        const csvContent = typeof res.data === 'string' ? res.data : String(res.data)
        const computedRowCount = Number.isFinite(rowCountHeader)
          ? rowCountHeader
          : Math.max(0, csvContent.trim().split('\n').length - 1)

        return {
          dataset,
          filename:
            filenameMatch?.[1] ??
            `smarthr-${dataset}-report-${new Date().toISOString().slice(0, 10)}.csv`,
          csvContent,
          rowCount: computedRowCount,
          generatedAtUtc: new Date().toISOString(),
        }
      } catch (error) {
        rethrowAsReportError(error, `Failed to export ${dataset} CSV report.`)
      }
    },
  }
}

