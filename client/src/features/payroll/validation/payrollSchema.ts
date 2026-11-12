import { z } from 'zod'
import {
  PAY_BASES,
  PAYROLL_SCHEDULES,
  type AddManualAdjustmentInput,
  type CreateCompensationInput,
  type CreatePayrollPeriodInput,
  type PayrollLineCategory,
} from '../../../types/payroll'
import { isValidCalendarDate } from '../../employees/validation/employeeSchema'
import {
  parsePhpAmountToCentavos,
  parseUnitsToHundredths,
} from '../utils/money'

export const PAYROLL_FIELD_LIMITS = {
  minPayrollDate: '2000-01-01',
  allowanceLabelMax: 80,
  periodLabelMax: 80,
  adjustmentLabelMin: 2,
  adjustmentLabelMax: 80,
  notesMax: 300,
} as const

export function normalizeAdjustmentKey(
  category: PayrollLineCategory,
  label: string,
): string {
  const slug = label.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${category.toLowerCase()}:${slug}`
}

export function subtractOneCalendarDay(isoDate: string): string {
  if (!isValidCalendarDate(isoDate)) {
    throw new RangeError(`Invalid calendar date "${isoDate}".`)
  }
  const [y, m, d] = isoDate.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d - 1))
  const year = prev.getUTCFullYear()
  const month = String(prev.getUTCMonth() + 1).padStart(2, '0')
  const day = String(prev.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export interface ParsedCompensationInput {
  employeeId: string
  payBasis: CreateCompensationInput['payBasis']
  baseAmountCentavos: number
  allowances: Array<{ label: string; amountCentavos: number }>
  effectiveDate: string
  endDate: string | null
  notes: string
}

export interface ParsedPayrollPeriodInput {
  label: string
  scheduleType: CreatePayrollPeriodInput['scheduleType']
  periodStart: string
  periodEnd: string
  payDate: string
}

export interface ParsedManualAdjustmentInput {
  entryId: string
  category: AddManualAdjustmentInput['category']
  label: string
  amountCentavos: number
  adjustmentKey: string
}

const compensationFormBaseSchema = z
  .object({
    employeeId: z.string().trim().min(1, 'Employee selection is required.'),
    payBasis: z.enum(PAY_BASES, {
      error: 'Select a valid pay basis (Monthly, Daily, or Hourly).',
    }),
    baseAmountInput: z.string().trim().min(1, 'Base compensation amount is required.'),
    effectiveDate: z
      .string()
      .trim()
      .min(1, 'Effective date is required.')
      .refine(isValidCalendarDate, 'Enter a valid effective date (YYYY-MM-DD).')
      .refine(
        (v) => v >= PAYROLL_FIELD_LIMITS.minPayrollDate,
        `Effective date cannot be earlier than ${PAYROLL_FIELD_LIMITS.minPayrollDate}.`,
      ),
    endDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => v ?? '')
      .refine(
        (v) => v === '' || isValidCalendarDate(v),
        'Enter a valid end date (YYYY-MM-DD).',
      ),
    notes: z
      .string()
      .trim()
      .max(
        PAYROLL_FIELD_LIMITS.notesMax,
        `Notes cannot exceed ${PAYROLL_FIELD_LIMITS.notesMax} characters.`,
      )
      .optional()
      .transform((v) => v ?? ''),
  })
  .superRefine((data, ctx) => {
    try {
      parsePhpAmountToCentavos(data.baseAmountInput)
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseAmountInput'],
        message:
          error instanceof Error
            ? error.message
            : 'Enter a valid non-negative PHP amount.',
      })
    }

    if (
      data.endDate &&
      isValidCalendarDate(data.effectiveDate) &&
      isValidCalendarDate(data.endDate) &&
      data.endDate < data.effectiveDate
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'End date cannot be earlier than effective date.',
      })
    }
  })

export function validateCreateCompensationInput(
  input: CreateCompensationInput,
): {
  success: true
  data: ParsedCompensationInput
} | {
  success: false
  message: string
  fieldErrors: Partial<Record<keyof CreateCompensationInput, string>>
} {
  const parsed = compensationFormBaseSchema.safeParse(input)
  const fieldErrors: Partial<Record<keyof CreateCompensationInput, string>> = {}

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !(key in fieldErrors)) {
        fieldErrors[key as keyof CreateCompensationInput] = issue.message
      }
    }
  }

  const parsedAllowances: Array<{ label: string; amountCentavos: number }> = []
  const seenLabels = new Set<string>()
  for (const rawAllowance of input.allowances ?? []) {
    const label = (rawAllowance.label ?? '').trim()
    const amountRaw = (rawAllowance.amountInput ?? '').trim()
    if (!label && !amountRaw) {
      continue
    }
    if (!label || label.length > PAYROLL_FIELD_LIMITS.allowanceLabelMax) {
      fieldErrors.allowances = `Each allowance label must be 1–${PAYROLL_FIELD_LIMITS.allowanceLabelMax} characters.`
      break
    }
    const labelKey = label.toLowerCase()
    if (seenLabels.has(labelKey)) {
      fieldErrors.allowances = `Duplicate configured allowance "${label}".`
      break
    }
    seenLabels.add(labelKey)

    try {
      const centavos = parsePhpAmountToCentavos(amountRaw)
      if (centavos <= 0) {
        fieldErrors.allowances = `Allowance "${label}" must be greater than PHP 0.00.`
        break
      }
      parsedAllowances.push({ label, amountCentavos: centavos })
    } catch (error) {
      fieldErrors.allowances =
        error instanceof Error
          ? error.message
          : `Invalid allowance amount for "${label}".`
      break
    }
  }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      message:
        Object.values(fieldErrors)[0] ??
        'Please fix compensation validation errors.',
      fieldErrors,
    }
  }

  return {
    success: true,
    data: {
      employeeId: parsed.data.employeeId,
      payBasis: parsed.data.payBasis,
      baseAmountCentavos: parsePhpAmountToCentavos(parsed.data.baseAmountInput),
      allowances: parsedAllowances,
      effectiveDate: parsed.data.effectiveDate,
      endDate: parsed.data.endDate || null,
      notes: parsed.data.notes,
    },
  }
}

const payrollPeriodSchema = z
  .object({
    label: z
      .string()
      .trim()
      .max(
        PAYROLL_FIELD_LIMITS.periodLabelMax,
        `Period label cannot exceed ${PAYROLL_FIELD_LIMITS.periodLabelMax} characters.`,
      )
      .optional()
      .transform((v) => v ?? ''),
    scheduleType: z.enum(PAYROLL_SCHEDULES, {
      error: 'Select a valid payroll schedule (Monthly, Semimonthly, or Weekly).',
    }),
    periodStart: z
      .string()
      .trim()
      .min(1, 'Period start date is required.')
      .refine(isValidCalendarDate, 'Enter a valid period start date (YYYY-MM-DD).')
      .refine(
        (v) => v >= PAYROLL_FIELD_LIMITS.minPayrollDate,
        `Period start date cannot be earlier than ${PAYROLL_FIELD_LIMITS.minPayrollDate}.`,
      ),
    periodEnd: z
      .string()
      .trim()
      .min(1, 'Period end date is required.')
      .refine(isValidCalendarDate, 'Enter a valid period end date (YYYY-MM-DD).')
      .refine(
        (v) => v >= PAYROLL_FIELD_LIMITS.minPayrollDate,
        `Period end date cannot be earlier than ${PAYROLL_FIELD_LIMITS.minPayrollDate}.`,
      ),
    payDate: z
      .string()
      .trim()
      .min(1, 'Pay date is required.')
      .refine(isValidCalendarDate, 'Enter a valid pay date (YYYY-MM-DD).')
      .refine(
        (v) => v >= PAYROLL_FIELD_LIMITS.minPayrollDate,
        `Pay date cannot be earlier than ${PAYROLL_FIELD_LIMITS.minPayrollDate}.`,
      ),
  })
  .superRefine((data, ctx) => {
    if (
      isValidCalendarDate(data.periodStart) &&
      isValidCalendarDate(data.periodEnd) &&
      data.periodEnd < data.periodStart
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['periodEnd'],
        message: 'Period end date cannot be earlier than period start date.',
      })
    }
    if (
      isValidCalendarDate(data.periodStart) &&
      isValidCalendarDate(data.payDate) &&
      data.payDate < data.periodStart
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['payDate'],
        message: 'Pay date cannot be earlier than period start date.',
      })
    }
  })

export function validateCreatePayrollPeriodInput(
  input: CreatePayrollPeriodInput,
): {
  success: true
  data: ParsedPayrollPeriodInput
} | {
  success: false
  message: string
  fieldErrors: Partial<Record<keyof CreatePayrollPeriodInput, string>>
} {
  const parsed = payrollPeriodSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof CreatePayrollPeriodInput, string>> =
      {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !(key in fieldErrors)) {
        fieldErrors[key as keyof CreatePayrollPeriodInput] = issue.message
      }
    }
    return {
      success: false,
      message:
        Object.values(fieldErrors)[0] ??
        'Please fix payroll period validation errors.',
      fieldErrors,
    }
  }

  const label =
    parsed.data.label ||
    `${parsed.data.scheduleType} (${parsed.data.periodStart} to ${parsed.data.periodEnd})`

  return {
    success: true,
    data: {
      label,
      scheduleType: parsed.data.scheduleType,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      payDate: parsed.data.payDate,
    },
  }
}

export function validateManualAdjustmentInput(
  input: AddManualAdjustmentInput,
): {
  success: true
  data: ParsedManualAdjustmentInput
} | {
  success: false
  message: string
} {
  if (!input.entryId?.trim()) {
    return { success: false, message: 'Payroll entry reference is required.' }
  }
  if (input.category !== 'Earning' && input.category !== 'Deduction') {
    return {
      success: false,
      message: 'Adjustment category must be Earning or Deduction.',
    }
  }

  const label = (input.label ?? '').trim()
  if (
    label.length < PAYROLL_FIELD_LIMITS.adjustmentLabelMin ||
    label.length > PAYROLL_FIELD_LIMITS.adjustmentLabelMax
  ) {
    return {
      success: false,
      message: `Adjustment description must be ${PAYROLL_FIELD_LIMITS.adjustmentLabelMin}–${PAYROLL_FIELD_LIMITS.adjustmentLabelMax} characters.`,
    }
  }

  let amountCentavos: number
  try {
    amountCentavos = parsePhpAmountToCentavos(input.amountInput ?? '')
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : 'Enter a valid PHP amount.',
    }
  }

  if (amountCentavos <= 0) {
    return {
      success: false,
      message: 'Adjustment amount must be greater than PHP 0.00.',
    }
  }

  return {
    success: true,
    data: {
      entryId: input.entryId.trim(),
      category: input.category,
      label,
      amountCentavos,
      adjustmentKey: normalizeAdjustmentKey(input.category, label),
    },
  }
}

export function validateConfirmedPayableUnitsInput(
  unitsInput: string,
): {
  success: true
  unitsHundredths: number
} | {
  success: false
  message: string
} {
  try {
    const unitsHundredths = parseUnitsToHundredths(unitsInput ?? '')
    return { success: true, unitsHundredths }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Enter a valid non-negative units value.',
    }
  }
}

