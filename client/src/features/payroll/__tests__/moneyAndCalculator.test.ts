import { describe, expect, it } from 'vitest'
import type { CompensationRecord } from '../../../types/payroll'
import {
  calculateDraftPayrollTotals,
  PHASE_6A_RULE_SNAPSHOT,
  resolveEffectiveCompensation,
} from '../engine/payrollCalculator'
import {
  addCentavos,
  formatHundredths,
  formatPhpFromCentavos,
  multiplyUnitsCentavos,
  parsePhpAmountToCentavos,
  parseUnitsToHundredths,
  roundHalfUpDiv,
  subtractCentavos,
  sumCentavos,
} from '../utils/money'

function makeComp(overrides: Partial<CompensationRecord> = {}): CompensationRecord {
  return {
    id: 'comp-1',
    employeeId: 'EMP-1001',
    employeeName: 'Jordan Taylor',
    department: 'Engineering',
    payBasis: 'Monthly',
    baseAmountCentavos: 3000000, // PHP 30,000.00
    currency: 'PHP',
    allowances: [],
    effectiveDate: '2026-10-01',
    endDate: null,
    status: 'Active',
    notes: '',
    createdByEmployeeId: 'EMP-1005',
    createdByRole: 'HR Admin',
    createdAtUtc: '2026-10-01T00:00:00.000Z',
    updatedAtUtc: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('Exact Centavo Money Utilities', () => {
  it('parses PHP decimal strings without binary floating-point drift', () => {
    expect(parsePhpAmountToCentavos('0.10') + parsePhpAmountToCentavos('0.20')).toBe(
      parsePhpAmountToCentavos('0.30'),
    )
    expect(parsePhpAmountToCentavos('19.99')).toBe(1999)
    expect(parsePhpAmountToCentavos('25,430.5')).toBe(2543050)
    expect(parsePhpAmountToCentavos('0')).toBe(0)
  })

  it('rejects negative, >2 decimal, empty, or non-numeric monetary inputs', () => {
    expect(() => parsePhpAmountToCentavos('')).toThrow()
    expect(() => parsePhpAmountToCentavos('-100')).toThrow(/negative/i)
    expect(() => parsePhpAmountToCentavos('100.123')).toThrow(/2 decimal/i)
    expect(() => parsePhpAmountToCentavos('abc')).toThrow(/numeric/i)
  })

  it('performs deterministic ROUND_HALF_UP division and unit multiplication', () => {
    // PHP 25,000.01 / 2 = 12,500.005 -> rounds half-up to PHP 12,500.01 (1250001 centavos)
    expect(roundHalfUpDiv(2500001, 2)).toBe(1250001)
    expect(roundHalfUpDiv(101, 2)).toBe(51)
    expect(roundHalfUpDiv(100, 3)).toBe(33)
    expect(roundHalfUpDiv(200, 3)).toBe(67)

    // Daily rate PHP 850.50 * 10.50 days = PHP 8,930.25 (893025 centavos)
    expect(multiplyUnitsCentavos(85050, parseUnitsToHundredths('10.5'))).toBe(893025)
    // Hourly rate PHP 100.01 * 0.50 hours = PHP 50.005 -> rounds half-up to PHP 50.01 (5001)
    expect(multiplyUnitsCentavos(10001, parseUnitsToHundredths('0.50'))).toBe(5001)
  })

  it('formats PHP currency and hundredth units cleanly including negatives', () => {
    expect(formatPhpFromCentavos(addCentavos(100050, 20025))).toBe('PHP 1,200.75')
    expect(formatPhpFromCentavos(subtractCentavos(50000, 75025))).toBe('-PHP 250.25')
    expect(sumCentavos([100, 200, 300])).toBe(600)
    expect(formatHundredths(1050)).toBe('10.50')
  })
})

describe('Draft Payroll Calculation Engine & Effective-Dated Lookup', () => {
  it('resolves historical vs newer effective-dated compensation by period date', () => {
    const oldRate = makeComp({
      id: 'comp-old',
      baseAmountCentavos: 2500000,
      effectiveDate: '2026-09-01',
      endDate: '2026-10-31',
      status: 'Superseded',
    })
    const newRate = makeComp({
      id: 'comp-new',
      baseAmountCentavos: 3000000,
      effectiveDate: '2026-11-01',
      endDate: null,
      status: 'Active',
    })

    expect(
      resolveEffectiveCompensation([newRate, oldRate], 'EMP-1001', '2026-10-15')?.id,
    ).toBe('comp-old')
    expect(
      resolveEffectiveCompensation([newRate, oldRate], 'EMP-1001', '2026-11-15')?.id,
    ).toBe('comp-new')
    expect(
      resolveEffectiveCompensation([newRate, oldRate], 'EMP-1001', '2026-08-31'),
    ).toBeNull()
  })

  it('calculates Monthly and Semimonthly draft totals with allowances and adjustments', () => {
    const comp = makeComp({
      baseAmountCentavos: 2500001, // PHP 25,000.01 -> odd centavo for half-up test
      allowances: [{ id: 'a1', label: 'Rice Subsidy', amountCentavos: 200001 }],
    })

    const semi = calculateDraftPayrollTotals({
      entryIdPrefix: 'e1',
      compensation: comp,
      scheduleType: 'Semimonthly',
      confirmedPayableUnitsHundredths: null,
      attendanceSessionsInPeriod: 8,
      manualAdjustments: [
        {
          id: 'adj-e',
          category: 'Earning',
          code: 'MANUAL_EARNING',
          label: 'Project Bonus',
          amountCentavos: 50000,
          source: 'Authorized Adjustment',
          adjustmentKey: 'Earning:project bonus',
        },
        {
          id: 'adj-d',
          category: 'Deduction',
          code: 'MANUAL_DEDUCTION',
          label: 'Cash Advance',
          amountCentavos: 30000,
          source: 'Authorized Adjustment',
          adjustmentKey: 'Deduction:cash advance',
        },
      ],
    })

    // 1250001 + 100001 + 50000 = 1400002 gross; deductions = 30000; net = 1370002
    expect(semi.grossPayCentavos).toBe(1400002)
    expect(semi.totalDeductionsCentavos).toBe(30000)
    expect(semi.netPayCentavos).toBe(1370002)
    expect(semi.requiresReview).toBe(false)
    expect(semi.hasNegativeNetPay).toBe(false)
    expect(semi.ruleSnapshot).toEqual(PHASE_6A_RULE_SNAPSHOT)

    const monthly = calculateDraftPayrollTotals({
      entryIdPrefix: 'e2',
      compensation: comp,
      scheduleType: 'Monthly',
      confirmedPayableUnitsHundredths: null,
      attendanceSessionsInPeriod: 0,
    })
    expect(monthly.grossPayCentavos).toBe(2700002)
    expect(monthly.netPayCentavos).toBe(2700002)
  })

  it('does not invent Weekly divisor for Monthly employees or auto-pay unconfirmed Daily/Hourly attendance', () => {
    const monthlyOnWeekly = calculateDraftPayrollTotals({
      entryIdPrefix: 'w1',
      compensation: makeComp({
        baseAmountCentavos: 3000000,
        allowances: [{ id: 'a1', label: 'Meal', amountCentavos: 100000 }],
      }),
      scheduleType: 'Weekly',
      confirmedPayableUnitsHundredths: null,
      attendanceSessionsInPeriod: 5,
    })
    expect(monthlyOnWeekly.grossPayCentavos).toBe(0)
    expect(monthlyOnWeekly.requiresReview).toBe(true)
    expect(monthlyOnWeekly.warnings.join(' ')).toContain('annualization divisor')

    const dailyUnconfirmed = calculateDraftPayrollTotals({
      entryIdPrefix: 'd1',
      compensation: makeComp({
        payBasis: 'Daily',
        baseAmountCentavos: 85000,
      }),
      scheduleType: 'Semimonthly',
      confirmedPayableUnitsHundredths: null,
      attendanceSessionsInPeriod: 9,
    })
    expect(dailyUnconfirmed.grossPayCentavos).toBe(0)
    expect(dailyUnconfirmed.requiresReview).toBe(true)
    expect(dailyUnconfirmed.warnings[0]).toContain('9 recorded sessions')

    const dailyConfirmed = calculateDraftPayrollTotals({
      entryIdPrefix: 'd2',
      compensation: makeComp({
        payBasis: 'Daily',
        baseAmountCentavos: 85000,
      }),
      scheduleType: 'Semimonthly',
      confirmedPayableUnitsHundredths: 1050, // 10.50 days
      attendanceSessionsInPeriod: 11,
    })
    expect(dailyConfirmed.grossPayCentavos).toBe(892500)
    expect(dailyConfirmed.requiresReview).toBe(false)
  })

  it('flags negative net pay when authorized deductions exceed gross pay', () => {
    const result = calculateDraftPayrollTotals({
      entryIdPrefix: 'neg',
      compensation: makeComp({ baseAmountCentavos: 1000000 }),
      scheduleType: 'Semimonthly',
      confirmedPayableUnitsHundredths: null,
      attendanceSessionsInPeriod: 0,
      manualAdjustments: [
        {
          id: 'adj-big',
          category: 'Deduction',
          code: 'MANUAL_DEDUCTION',
          label: 'Equipment Recovery',
          amountCentavos: 700000, // 7,000 deduction vs 5,000 gross
          source: 'Authorized Adjustment',
          adjustmentKey: 'Deduction:equipment recovery',
        },
      ],
    })

    expect(result.grossPayCentavos).toBe(500000)
    expect(result.totalDeductionsCentavos).toBe(700000)
    expect(result.netPayCentavos).toBe(-200000)
    expect(result.hasNegativeNetPay).toBe(true)
    expect(result.requiresReview).toBe(true)
    expect(result.warnings.some((w) => /Negative net pay/i.test(w))).toBe(true)
  })
})
