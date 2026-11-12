import type {
  CompensationRecord,
  PayrollLineItem,
  PayrollRuleSnapshot,
  PayrollSchedule,
} from '../../../types/payroll'
import { normalizeEmployeeId } from '../../employees/validation/employeeSchema'
import {
  formatHundredths,
  formatPhpFromCentavos,
  multiplyUnitsCentavos,
  roundHalfUpDiv,
  subtractCentavos,
  sumCentavos,
} from '../utils/money'

export const PHASE_6A_RULE_SNAPSHOT: PayrollRuleSnapshot = {
  engineVersion: 'phase-6a-v1',
  calculationMethod: 'INTEGER_CENTAVOS',
  roundingMode: 'ROUND_HALF_UP',
  statutoryDeductionsEnabled: false,
  overtimePolicyConfigured: false,
  absenceDeductionPolicyConfigured: false,
  holidayPayPolicyConfigured: false,
  ruleVersionDate: '2026-11-13',
}

export function resolveEffectiveCompensation(
  records: readonly CompensationRecord[],
  employeeId: string,
  asOfDate: string,
): CompensationRecord | null {
  const targetKey = normalizeEmployeeId(employeeId)
  const matching = records.filter(
    (rec) =>
      normalizeEmployeeId(rec.employeeId) === targetKey &&
      rec.status !== 'Inactive' &&
      rec.effectiveDate <= asOfDate &&
      (rec.endDate === null || rec.endDate >= asOfDate),
  )

  if (matching.length === 0) {
    return null
  }

  matching.sort(
    (a, b) =>
      b.effectiveDate.localeCompare(a.effectiveDate) ||
      Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc),
  )

  return matching[0]
}

export interface CalculateDraftPayrollInput {
  entryIdPrefix: string
  compensation: CompensationRecord
  scheduleType: PayrollSchedule
  confirmedPayableUnitsHundredths: number | null
  attendanceSessionsInPeriod: number
  manualAdjustments?: readonly PayrollLineItem[]
}

export interface CalculatedDraftTotals {
  earnings: PayrollLineItem[]
  deductions: PayrollLineItem[]
  grossPayCentavos: number
  totalDeductionsCentavos: number
  netPayCentavos: number
  requiresReview: boolean
  hasNegativeNetPay: boolean
  warnings: string[]
  ruleSnapshot: PayrollRuleSnapshot
}

export function calculateDraftPayrollTotals(
  input: CalculateDraftPayrollInput,
): CalculatedDraftTotals {
  const {
    entryIdPrefix,
    compensation,
    scheduleType,
    confirmedPayableUnitsHundredths,
    attendanceSessionsInPeriod,
    manualAdjustments = [],
  } = input

  if (compensation.baseAmountCentavos < 0) {
    throw new RangeError('Compensation base amount cannot be negative.')
  }

  const earnings: PayrollLineItem[] = []
  const deductions: PayrollLineItem[] = []
  const warnings: string[] = []
  let requiresReview = false

  // 1. Base Pay
  if (compensation.payBasis === 'Monthly') {
    if (scheduleType === 'Monthly') {
      earnings.push({
        id: `${entryIdPrefix}-base`,
        category: 'Earning',
        code: 'BASE_PAY',
        label: 'Base Pay (Monthly)',
        amountCentavos: compensation.baseAmountCentavos,
        source: 'Compensation Base',
        adjustmentKey: null,
      })
    } else if (scheduleType === 'Semimonthly') {
      earnings.push({
        id: `${entryIdPrefix}-base`,
        category: 'Earning',
        code: 'BASE_PAY',
        label: 'Base Pay (Semimonthly 1/2, ROUND_HALF_UP)',
        amountCentavos: roundHalfUpDiv(compensation.baseAmountCentavos, 2),
        source: 'Compensation Base',
        adjustmentKey: null,
      })
    } else {
      earnings.push({
        id: `${entryIdPrefix}-base`,
        category: 'Earning',
        code: 'BASE_PAY',
        label: 'Base Pay (Unsupported: Weekly factor required)',
        amountCentavos: 0,
        source: 'Compensation Base',
        adjustmentKey: null,
      })
      requiresReview = true
      warnings.push(
        'Monthly pay basis on a Weekly schedule requires a confirmed annualization divisor policy (Phase 6B). Base pay set to PHP 0.00 pending configuration.',
      )
    }
  } else {
    const unitNoun = compensation.payBasis === 'Daily' ? 'days' : 'hours'
    if (confirmedPayableUnitsHundredths !== null) {
      const computedBase = multiplyUnitsCentavos(
        compensation.baseAmountCentavos,
        confirmedPayableUnitsHundredths,
      )
      earnings.push({
        id: `${entryIdPrefix}-base`,
        category: 'Earning',
        code: 'BASE_PAY',
        label: `Base Pay (${formatHundredths(confirmedPayableUnitsHundredths)} confirmed ${unitNoun} @ ${formatPhpFromCentavos(compensation.baseAmountCentavos)})`,
        amountCentavos: computedBase,
        source: 'Confirmed Payable Units',
        adjustmentKey: null,
      })
    } else {
      earnings.push({
        id: `${entryIdPrefix}-base`,
        category: 'Earning',
        code: 'BASE_PAY',
        label: `Base Pay (${compensation.payBasis} units unconfirmed)`,
        amountCentavos: 0,
        source: 'Compensation Base',
        adjustmentKey: null,
      })
      requiresReview = true
      warnings.push(
        `${compensation.payBasis} pay basis requires HR-confirmed payable ${unitNoun}. Raw attendance records (${attendanceSessionsInPeriod} recorded session${attendanceSessionsInPeriod === 1 ? '' : 's'}) are not assumed payable without schedule/overtime policies.`,
      )
    }
  }

  // 2. Configured Recurring Allowances
  for (let i = 0; i < compensation.allowances.length; i += 1) {
    const allowance = compensation.allowances[i]
    if (allowance.amountCentavos < 0) {
      throw new RangeError('Configured allowance amount cannot be negative.')
    }

    if (compensation.payBasis === 'Monthly' && scheduleType === 'Semimonthly') {
      earnings.push({
        id: `${entryIdPrefix}-allow-${i}`,
        category: 'Earning',
        code: 'ALLOWANCE',
        label: `${allowance.label} (Semimonthly 1/2)`,
        amountCentavos: roundHalfUpDiv(allowance.amountCentavos, 2),
        source: 'Configured Allowance',
        adjustmentKey: null,
      })
    } else if (
      compensation.payBasis === 'Monthly' &&
      scheduleType === 'Weekly'
    ) {
      // Do not fabricate weekly allowance conversion without confirmed policy
      requiresReview = true
      warnings.push(
        `Allowance "${allowance.label}" skipped for Weekly schedule until conversion factor is configured.`,
      )
    } else {
      earnings.push({
        id: `${entryIdPrefix}-allow-${i}`,
        category: 'Earning',
        code: 'ALLOWANCE',
        label: allowance.label,
        amountCentavos: allowance.amountCentavos,
        source: 'Configured Allowance',
        adjustmentKey: null,
      })
    }
  }

  // 3. Authorized Adjustments (Earnings & Deductions separated cleanly)
  for (const adj of manualAdjustments) {
    if (adj.amountCentavos < 0) {
      throw new RangeError('Adjustment line amount cannot be negative.')
    }
    if (adj.category === 'Earning') {
      earnings.push({ ...adj })
    } else {
      deductions.push({ ...adj })
    }
  }

  // 4. Totals using exact centavo arithmetic
  const grossPayCentavos = sumCentavos(earnings.map((item) => item.amountCentavos))
  const totalDeductionsCentavos = sumCentavos(
    deductions.map((item) => item.amountCentavos),
  )
  const netPayCentavos = subtractCentavos(
    grossPayCentavos,
    totalDeductionsCentavos,
  )

  const hasNegativeNetPay = netPayCentavos < 0
  if (hasNegativeNetPay) {
    requiresReview = true
    warnings.push(
      'Negative net pay detected — total deductions exceed gross pay. Authorized review required.',
    )
  }

  return {
    earnings,
    deductions,
    grossPayCentavos,
    totalDeductionsCentavos,
    netPayCentavos,
    requiresReview,
    hasNegativeNetPay,
    warnings,
    ruleSnapshot: { ...PHASE_6A_RULE_SNAPSHOT },
  }
}

