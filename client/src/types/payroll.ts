import type { AssignedRole, Department } from './employee'

export const PAY_BASES = ['Monthly', 'Daily', 'Hourly'] as const
export type PayBasis = (typeof PAY_BASES)[number]

export const PAYROLL_SCHEDULES = ['Monthly', 'Semimonthly', 'Weekly'] as const
export type PayrollSchedule = (typeof PAYROLL_SCHEDULES)[number]

export const PAYROLL_STATUSES = [
  'Draft',
  'Calculated',
  'Under Review',
  'In Review',
  'Approved',
  'Locked',
] as const
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number]

export const COMPENSATION_STATUSES = [
  'Active',
  'Superseded',
  'Inactive',
] as const
export type CompensationStatus = (typeof COMPENSATION_STATUSES)[number]

export type PayrollCurrency = 'PHP'

export type PayrollLineCategory = 'Earning' | 'Deduction' | 'EmployerCost'

export type PayrollLineSource =
  | 'Compensation Base'
  | 'Configured Allowance'
  | 'Confirmed Payable Units'
  | 'Authorized Adjustment'
  | 'Philippine Statutory (SSS)'
  | 'Philippine Statutory (PhilHealth)'
  | 'Philippine Statutory (Pag-IBIG)'
  | 'Philippine Statutory (BIR)'

export interface PayrollActorContext {
  actorEmployeeId: string | null | undefined
  sessionExpiresAtUtc?: string | null
}

export interface CompensationAllowanceItem {
  id: string
  label: string
  amountCentavos: number
  taxable?: boolean | null
}

export interface CompensationRecord {
  id: string
  employeeId: string
  employeeName: string
  department: Department
  payBasis: PayBasis
  baseAmountCentavos: number
  currency: PayrollCurrency
  statutoryEligible?: boolean
  allowances: CompensationAllowanceItem[]
  effectiveDate: string
  endDate: string | null
  status: CompensationStatus
  notes: string
  createdByEmployeeId: string
  createdByRole: AssignedRole
  createdAtUtc: string
  updatedAtUtc: string
}

export interface CreateCompensationInput {
  employeeId: string
  payBasis: PayBasis
  baseAmountInput: string
  allowances?: Array<{
    label: string
    amountInput: string
    taxable?: boolean | null
  }>
  statutoryEligible?: boolean
  effectiveDate: string
  endDate?: string
  notes?: string
}

export type StatutoryAllocationMode = 'HALF_HALF' | 'FULL_SECOND_HALF'

export interface PayrollPeriod {
  id: string
  label: string
  scheduleType: PayrollSchedule
  periodStart: string
  periodEnd: string
  payDate: string
  semimonthlyHalf?: 1 | 2 | null
  statutoryAllocationMode?: StatutoryAllocationMode
  status: PayrollStatus
  businessTimezone: string
  createdByEmployeeId: string
  createdByName: string
  createdByRole?: AssignedRole
  createdAtUtc: string
  updatedAtUtc: string
  reviewedByEmployeeId: string | null
  reviewedByName: string | null
  reviewedAtUtc: string | null
  reviewNotes: string | null
  approvedByEmployeeId?: string | null
  approvedByName?: string | null
  approvedAtUtc?: string | null
  approvalNotes?: string | null
  lockedByEmployeeId?: string | null
  lockedByName?: string | null
  lockedAtUtc?: string | null
  returnedReason?: string | null
  version?: number
}

export interface CreatePayrollPeriodInput {
  label?: string
  scheduleType: PayrollSchedule
  periodStart: string
  periodEnd: string
  payDate: string
  semimonthlyHalf?: 1 | 2 | null
  statutoryAllocationMode?: StatutoryAllocationMode
}

export interface PayrollLineItem {
  id: string
  category: PayrollLineCategory
  code: string
  label: string
  amountCentavos: number
  source: PayrollLineSource | string
  isTaxable?: boolean | null
  adjustmentKey: string | null
}

export interface PayrollRuleSnapshot {
  engineVersion: string
  calculationMethod: 'INTEGER_CENTAVOS'
  roundingMode: 'ROUND_HALF_UP'
  statutoryDeductionsEnabled: boolean
  overtimePolicyConfigured?: boolean
  absenceDeductionPolicyConfigured?: boolean
  holidayPayPolicyConfigured?: boolean
  ruleVersionDate?: string
  asOfDate?: string
}

export interface PayrollEntry {
  id: string
  payrollPeriodId: string
  periodLabel: string
  scheduleType: PayrollSchedule
  periodStart: string
  periodEnd: string
  payDate: string
  employeeId: string
  employeeName: string
  department: Department
  compensationId: string
  payBasis: PayBasis
  baseCompensationCentavos: number
  currency: PayrollCurrency
  confirmedPayableUnitsHundredths: number | null
  attendanceSessionsInPeriod: number
  earnings: PayrollLineItem[]
  deductions: PayrollLineItem[]
  employerCosts?: PayrollLineItem[]
  taxableCompensationCentavos?: number
  grossPayCentavos: number
  totalStatutoryEmployeeCentavos?: number
  totalOtherDeductionsCentavos?: number
  totalDeductionsCentavos: number
  totalEmployerCostCentavos?: number
  netPayCentavos: number
  status: PayrollStatus
  requiresReview: boolean
  hasNegativeNetPay: boolean
  warnings: string[]
  ruleSnapshot: PayrollRuleSnapshot
  createdAtUtc: string
  updatedAtUtc: string
}

export interface MissingCompensationWarning {
  employeeId: string
  employeeName: string
  department: Department
  reason: string
}

export interface DraftPayrollGenerationResult {
  period: PayrollPeriod
  generatedEntries: PayrollEntry[]
  addedCount: number
  preservedExistingCount: number
  missingCompensationWarnings: MissingCompensationWarning[]
}

export interface AddManualAdjustmentInput {
  entryId: string
  category: 'Earning' | 'Deduction'
  label: string
  amountInput: string
  isTaxable?: boolean | null
}

export interface SetConfirmedPayableUnitsInput {
  entryId: string
  unitsInput: string
}

export type PayrollAuditEventType =
  | 'COMPENSATION_CREATED'
  | 'COMPENSATION_SUPERSEDED'
  | 'PAYROLL_PERIOD_CREATED'
  | 'PAYROLL_DRAFT_GENERATED'
  | 'PAYROLL_CALCULATED'
  | 'PAYROLL_UNITS_CONFIRMED'
  | 'PAYROLL_ADJUSTMENT_ADDED'
  | 'PAYROLL_MARKED_IN_REVIEW'
  | 'PAYROLL_SUBMITTED_FOR_REVIEW'
  | 'PAYROLL_RETURNED_FOR_CORRECTION'
  | 'PAYROLL_APPROVED'
  | 'PAYROLL_LOCKED'

export interface PayrollAuditEntry {
  id: string
  eventType: PayrollAuditEventType
  actorEmployeeId: string
  actorName: string
  actorRole: AssignedRole
  targetEmployeeId: string | null
  payrollPeriodId: string | null
  summary: string
  timestampUtc: string
}

export interface PhStatutoryPlaceholder {
  agencyCode: 'SSS' | 'PHILHEALTH' | 'PAGIBIG' | 'BIR' | 'DOLE'
  agencyName: string
  scope: string
  enabled: false
  statusLabel: string
  officialUrl: string
  requiredVerificationItems: readonly string[]
}

export interface StatutoryRuleVersionDto {
  id: number
  rule_key: string
  agency: string
  issuance_reference: string
  official_url: string
  effective_from: string
  effective_to: string | null
  is_active: boolean
}
