import type { Employee } from '../../../types/employee'
import type {
  AddManualAdjustmentInput,
  CompensationRecord,
  CreateCompensationInput,
  CreatePayrollPeriodInput,
  DraftPayrollGenerationResult,
  PayrollActorContext,
  PayrollAuditEntry,
  PayrollEntry,
  PayrollPeriod,
  SetConfirmedPayableUnitsInput,
  StatutoryRuleVersionDto,
} from '../../../types/payroll'

export type PayrollServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'EMPLOYEE_INACTIVE'
  | 'EMPLOYEE_NOT_FOUND'
  | 'COMPENSATION_NOT_FOUND'
  | 'PERIOD_NOT_FOUND'
  | 'ENTRY_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_EFFECTIVE_DATE'
  | 'DUPLICATE_PAYROLL_PERIOD'
  | 'DUPLICATE_ADJUSTMENT'
  | 'INVALID_STATUS_TRANSITION'
  | 'APPROVAL_POLICY_UNCONFIGURED'
  | 'CONCURRENCY_CONFLICT'
  | 'PERSISTENCE_ERROR'

export class PayrollServiceError extends Error {
  readonly code: PayrollServiceErrorCode
  readonly httpStatus: 400 | 401 | 403 | 404 | 409 | 422 | 500
  readonly fieldErrors?: Record<string, string>

  constructor(
    code: PayrollServiceErrorCode,
    message: string,
    httpStatus?: 400 | 401 | 403 | 404 | 409 | 422 | 500,
    fieldErrors?: Record<string, string>,
  ) {
    super(message)
    this.name = 'PayrollServiceError'
    this.code = code
    this.fieldErrors = fieldErrors
    this.httpStatus =
      httpStatus ??
      (code === 'UNAUTHORIZED' ||
      code === 'EMPLOYEE_INACTIVE' ||
      code === 'APPROVAL_POLICY_UNCONFIGURED'
        ? 403
        : code === 'EMPLOYEE_NOT_FOUND' ||
            code === 'COMPENSATION_NOT_FOUND' ||
            code === 'PERIOD_NOT_FOUND' ||
            code === 'ENTRY_NOT_FOUND'
          ? 404
          : code === 'VALIDATION_ERROR'
            ? 400
            : code === 'PERSISTENCE_ERROR'
              ? 500
              : 409)
  }
}

export interface PayrollService {
  readonly isDemoMode: boolean
  readonly businessTimezone: string
  readonly statutoryDeductionsEnabled: boolean
  readonly finalApprovalEnabled: boolean
  listDirectoryEmployees?(actor: PayrollActorContext): Promise<Employee[]>
  listStatutoryRules?(
    actor: PayrollActorContext,
  ): Promise<StatutoryRuleVersionDto[]>
  listCompensationRecords(
    actor: PayrollActorContext,
  ): Promise<CompensationRecord[]>
  createCompensationRecord(
    input: CreateCompensationInput,
    actor: PayrollActorContext,
  ): Promise<CompensationRecord>
  listPayrollPeriods(actor: PayrollActorContext): Promise<PayrollPeriod[]>
  createPayrollPeriod(
    input: CreatePayrollPeriodInput,
    actor: PayrollActorContext,
  ): Promise<PayrollPeriod>
  generateDraftPayroll(
    periodId: string,
    actor: PayrollActorContext,
  ): Promise<DraftPayrollGenerationResult>
  listPayrollEntriesForPeriod(
    periodId: string,
    actor: PayrollActorContext,
  ): Promise<PayrollEntry[]>
  setConfirmedPayableUnits(
    input: SetConfirmedPayableUnitsInput,
    actor: PayrollActorContext,
  ): Promise<PayrollEntry>
  addManualAdjustment(
    input: AddManualAdjustmentInput,
    actor: PayrollActorContext,
  ): Promise<PayrollEntry>
  markPeriodInReview(
    periodId: string,
    reviewNotes: string | undefined,
    actor: PayrollActorContext,
  ): Promise<PayrollPeriod>
  returnPeriodForCorrection?(
    periodId: string,
    reason: string,
    actor: PayrollActorContext,
  ): Promise<PayrollPeriod>
  approvePayrollPeriod(
    periodId: string,
    actor: PayrollActorContext,
    approvalNotes?: string,
    expectedVersion?: number,
  ): Promise<PayrollPeriod>
  lockPayrollPeriod?(
    periodId: string,
    actor: PayrollActorContext,
    expectedVersion?: number,
  ): Promise<PayrollPeriod>
  downloadPayslipPdf?(
    entryId: string,
    actor: PayrollActorContext,
  ): Promise<Blob>
  listMyPayslips(actor: PayrollActorContext): Promise<PayrollEntry[]>
  getPayslipEntryById(
    entryId: string,
    actor: PayrollActorContext,
  ): Promise<PayrollEntry>
  listPayrollAuditHistory(
    actor: PayrollActorContext,
  ): Promise<PayrollAuditEntry[]>
}

