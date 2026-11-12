import type { AxiosInstance } from 'axios'
import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import type { Employee } from '../../../types/employee'
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
} from '../../../types/payroll'
import { ApiClientError, createApiHttpClient } from '../../api/httpClient'
import {
  PayrollServiceError,
  type PayrollService,
  type PayrollServiceErrorCode,
} from './payrollTypes'

export interface ApiPayrollServiceOptions {
  httpClient?: AxiosInstance
}

function mapApiErrorCode(
  code: string,
  status: number,
): PayrollServiceErrorCode {
  switch (code) {
    case 'EMPLOYEE_INACTIVE':
    case 'EMPLOYEE_NOT_FOUND':
    case 'COMPENSATION_NOT_FOUND':
    case 'PERIOD_NOT_FOUND':
    case 'ENTRY_NOT_FOUND':
    case 'VALIDATION_ERROR':
    case 'DUPLICATE_EFFECTIVE_DATE':
    case 'DUPLICATE_PAYROLL_PERIOD':
    case 'DUPLICATE_ADJUSTMENT':
    case 'INVALID_STATUS_TRANSITION':
    case 'APPROVAL_POLICY_UNCONFIGURED':
    case 'CONCURRENCY_CONFLICT':
    case 'UNAUTHORIZED':
      return code
    case 'SEGREGATION_OF_DUTIES_VIOLATION':
    case 'FORBIDDEN':
      return 'UNAUTHORIZED'
    default:
      if (status === 401 || status === 403) return 'UNAUTHORIZED'
      if (status === 404) return 'PERIOD_NOT_FOUND'
      if (status === 422 || status === 400) return 'VALIDATION_ERROR'
      if (status === 409) return 'INVALID_STATUS_TRANSITION'
      return 'PERSISTENCE_ERROR'
  }
}

function mapHttpStatus(status: number): 400 | 401 | 403 | 404 | 409 | 422 | 500 {
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 422
  ) {
    return status
  }
  return 500
}

function rethrowAsPayrollError(error: unknown, fallback: string): never {
  if (error instanceof PayrollServiceError) {
    throw error
  }
  if (error instanceof ApiClientError) {
    throw new PayrollServiceError(
      mapApiErrorCode(error.code, error.httpStatus),
      error.message,
      mapHttpStatus(error.httpStatus),
      error.fieldErrors,
    )
  }
  throw new PayrollServiceError(
    'PERSISTENCE_ERROR',
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : fallback,
    500,
  )
}

export function createApiPayrollService(
  options: ApiPayrollServiceOptions = {},
): PayrollService {
  const client = options.httpClient ?? createApiHttpClient()

  return {
    isDemoMode: false,
    businessTimezone: BUSINESS_TIMEZONE,
    statutoryDeductionsEnabled: true,
    finalApprovalEnabled: true,

    async listDirectoryEmployees(): Promise<Employee[]> {
      try {
        const res = await client.get<{
          employees: Array<{
            id: number
            employeeId: string
            fullName: string
            workEmail: string
            department: Employee['department']
            position: string
            employmentStatus: Employee['employmentStatus']
            hireDate: string
            assignedRole: Employee['assignedRole']
            createdAt?: string
          }>
        }>('/employees')
        return res.data.employees.map((e) => ({
          ...e,
          id: String(e.id),
          createdAt:
            e.createdAt ?? (e.hireDate ? `${e.hireDate}T00:00:00.000Z` : ''),
        }))
      } catch (error) {
        rethrowAsPayrollError(error, 'Failed to fetch organization employees.')
      }
    },

    async listStatutoryRules(): Promise<StatutoryRuleVersionDto[]> {
      try {
        const res = await client.get<{
          statutoryRules: StatutoryRuleVersionDto[]
        }>('/payroll/statutory-rules')
        return res.data.statutoryRules
      } catch (error) {
        rethrowAsPayrollError(error, 'Failed to load Philippine statutory rules.')
      }
    },

    async listCompensationRecords(): Promise<CompensationRecord[]> {
      try {
        const res = await client.get<{
          compensations: CompensationRecord[]
        }>('/payroll/compensations')
        return res.data.compensations
      } catch (error) {
        rethrowAsPayrollError(error, 'Failed to load compensation records.')
      }
    },

    async createCompensationRecord(
      input: CreateCompensationInput,
    ): Promise<CompensationRecord> {
      try {
        const res = await client.post<{ compensation: CompensationRecord }>(
          '/payroll/compensations',
          {
            employee_code: input.employeeId.trim(),
            pay_basis: input.payBasis,
            base_amount: input.baseAmountInput.trim().replaceAll(',', ''),
            allowances: (input.allowances ?? [])
              .filter(
                (a) =>
                  a.label.trim().length > 0 || a.amountInput.trim().length > 0,
              )
              .map((a) => ({
                label: a.label.trim(),
                amount: a.amountInput.trim().replaceAll(',', ''),
                taxable: a.taxable ?? null,
              })),
            statutory_eligible: input.statutoryEligible ?? true,
            effective_date: input.effectiveDate,
            end_date: input.endDate ? input.endDate : null,
            notes: input.notes?.trim() ? input.notes.trim() : null,
          },
        )
        return res.data.compensation
      } catch (error) {
        rethrowAsPayrollError(error, 'Unable to save compensation record.')
      }
    },

    async listPayrollPeriods(): Promise<PayrollPeriod[]> {
      try {
        const res = await client.get<{ periods: PayrollPeriod[] }>(
          '/payroll/periods',
        )
        return res.data.periods
      } catch (error) {
        rethrowAsPayrollError(error, 'Failed to load payroll periods.')
      }
    },

    async createPayrollPeriod(
      input: CreatePayrollPeriodInput,
    ): Promise<PayrollPeriod> {
      try {
        const res = await client.post<{ period: PayrollPeriod }>(
          '/payroll/periods',
          {
            label: input.label?.trim() || null,
            schedule_type: input.scheduleType,
            period_start: input.periodStart,
            period_end: input.periodEnd,
            pay_date: input.payDate,
            semimonthly_half:
              input.scheduleType === 'Semimonthly'
                ? (input.semimonthlyHalf ?? null)
                : null,
            statutory_allocation_mode:
              input.statutoryAllocationMode ?? 'HALF_HALF',
          },
        )
        return res.data.period
      } catch (error) {
        rethrowAsPayrollError(error, 'Unable to create payroll period.')
      }
    },

    async generateDraftPayroll(
      periodId: string,
    ): Promise<DraftPayrollGenerationResult> {
      try {
        const res = await client.post<DraftPayrollGenerationResult>(
          `/payroll/periods/${encodeURIComponent(periodId)}/calculate`,
        )
        return res.data
      } catch (error) {
        rethrowAsPayrollError(error, 'Failed to calculate payroll period.')
      }
    },

    async listPayrollEntriesForPeriod(
      periodId: string,
    ): Promise<PayrollEntry[]> {
      try {
        const res = await client.get<{ entries: PayrollEntry[] }>(
          `/payroll/periods/${encodeURIComponent(periodId)}/entries`,
        )
        return res.data.entries
      } catch (error) {
        rethrowAsPayrollError(error, 'Failed to load payroll period entries.')
      }
    },

    async setConfirmedPayableUnits(
      input: SetConfirmedPayableUnitsInput,
    ): Promise<PayrollEntry> {
      try {
        const res = await client.patch<{ entry: PayrollEntry }>(
          `/payroll/entries/${encodeURIComponent(input.entryId)}/units`,
          {
            units_input: input.unitsInput.trim(),
          },
        )
        return res.data.entry
      } catch (error) {
        rethrowAsPayrollError(error, 'Unable to update payable units.')
      }
    },

    async addManualAdjustment(
      input: AddManualAdjustmentInput,
    ): Promise<PayrollEntry> {
      try {
        const res = await client.post<{ entry: PayrollEntry }>(
          `/payroll/entries/${encodeURIComponent(input.entryId)}/adjustments`,
          {
            category: input.category,
            label: input.label.trim(),
            amount: input.amountInput.trim().replaceAll(',', ''),
            is_taxable: input.isTaxable ?? null,
          },
        )
        return res.data.entry
      } catch (error) {
        rethrowAsPayrollError(error, 'Unable to add manual adjustment.')
      }
    },

    async markPeriodInReview(
      periodId: string,
      reviewNotes: string | undefined,
    ): Promise<PayrollPeriod> {
      try {
        const res = await client.post<{ period: PayrollPeriod }>(
          `/payroll/periods/${encodeURIComponent(periodId)}/submit-review`,
          {
            review_notes: reviewNotes?.trim() || null,
          },
        )
        return res.data.period
      } catch (error) {
        rethrowAsPayrollError(error, 'Unable to submit payroll period for review.')
      }
    },

    async returnPeriodForCorrection(
      periodId: string,
      reason: string,
    ): Promise<PayrollPeriod> {
      try {
        const res = await client.post<{ period: PayrollPeriod }>(
          `/payroll/periods/${encodeURIComponent(periodId)}/return`,
          {
            reason: reason.trim(),
          },
        )
        return res.data.period
      } catch (error) {
        rethrowAsPayrollError(error, 'Unable to return payroll period.')
      }
    },

    async approvePayrollPeriod(
      periodId: string,
      _actor,
      approvalNotes?: string,
      expectedVersion?: number,
    ): Promise<PayrollPeriod> {
      try {
        const res = await client.post<{ period: PayrollPeriod }>(
          `/payroll/periods/${encodeURIComponent(periodId)}/approve`,
          {
            approval_notes: approvalNotes?.trim() || null,
            expected_version: expectedVersion ?? null,
          },
        )
        return res.data.period
      } catch (error) {
        rethrowAsPayrollError(error, 'Unable to approve payroll period.')
      }
    },

    async lockPayrollPeriod(
      periodId: string,
      _actor,
      expectedVersion?: number,
    ): Promise<PayrollPeriod> {
      try {
        const res = await client.post<{ period: PayrollPeriod }>(
          `/payroll/periods/${encodeURIComponent(periodId)}/lock`,
          {
            expected_version: expectedVersion ?? null,
          },
        )
        return res.data.period
      } catch (error) {
        rethrowAsPayrollError(error, 'Unable to lock payroll period.')
      }
    },

    async downloadPayslipPdf(entryId: string): Promise<Blob> {
      try {
        const res = await client.get<Blob>(
          `/payroll/payslips/${encodeURIComponent(entryId)}/pdf`,
          {
            responseType: 'blob',
          },
        )
        return res.data
      } catch (error) {
        rethrowAsPayrollError(error, 'Unable to download payslip PDF.')
      }
    },

    async listMyPayslips(): Promise<PayrollEntry[]> {
      try {
        const res = await client.get<{ payslips: PayrollEntry[] }>(
          '/payroll/payslips/me',
        )
        return res.data.payslips
      } catch (error) {
        rethrowAsPayrollError(error, 'Failed to load personal payslips.')
      }
    },

    async getPayslipEntryById(entryId: string): Promise<PayrollEntry> {
      try {
        const res = await client.get<{ payslip: PayrollEntry }>(
          `/payroll/payslips/${encodeURIComponent(entryId)}`,
        )
        return res.data.payslip
      } catch (error) {
        rethrowAsPayrollError(error, 'Failed to load payslip details.')
      }
    },

    async listPayrollAuditHistory(): Promise<PayrollAuditEntry[]> {
      try {
        const res = await client.get<{ auditLogs: PayrollAuditEntry[] }>(
          '/payroll/audit-logs',
        )
        return res.data.auditLogs
      } catch (error) {
        rethrowAsPayrollError(error, 'Failed to load payroll audit history.')
      }
    },
  }
}

