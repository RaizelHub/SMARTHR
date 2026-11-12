import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import type { Employee } from '../../../types/employee'
import type {
  AddManualAdjustmentInput,
  CompensationRecord,
  CreateCompensationInput,
  CreatePayrollPeriodInput,
  DraftPayrollGenerationResult,
  MissingCompensationWarning,
  PayrollActorContext,
  PayrollAuditEntry,
  PayrollEntry,
  PayrollLineItem,
  PayrollPeriod,
  SetConfirmedPayableUnitsInput,
} from '../../../types/payroll'
import { isBackendApiConfigured } from '../../api/httpClient'
import {
  attendanceService as defaultAttendanceService,
  type AttendanceService,
} from '../../attendance/services/attendanceService'
import {
  canViewPayrollEntry,
  hasPermission,
} from '../../auth/permissions'
import {
  appendSecurityAuditEvent,
  isSessionExpired,
} from '../../auth/securityAudit'
import {
  employeeService as defaultEmployeeService,
  type EmployeeService,
  type StorageLike,
} from '../../employees/services/employeeService'
import { normalizeEmployeeId } from '../../employees/validation/employeeSchema'
import {
  calculateDraftPayrollTotals,
  resolveEffectiveCompensation,
} from '../engine/payrollCalculator'
import { formatHundredths } from '../utils/money'
import {
  subtractOneCalendarDay,
  validateConfirmedPayableUnitsInput,
  validateCreateCompensationInput,
  validateCreatePayrollPeriodInput,
  validateManualAdjustmentInput,
} from '../validation/payrollSchema'
import { createApiPayrollService } from './payrollApiService'
import {
  PayrollServiceError,
  type PayrollService,
  type PayrollServiceErrorCode,
} from './payrollTypes'

export {
  PayrollServiceError,
  type PayrollService,
  type PayrollServiceErrorCode,
}

/**
 * DEMO-ONLY CLIENT PAYROLL PERSISTENCE LAYER
 *
 * Used automatically when VITE_API_BASE_URL is not configured so isolated
 * Phase 6A demos and client tests continue running against localStorage.
 */
export const DEMO_COMPENSATION_STORAGE_KEY = 'smarthr.demo.compensation.v1'
export const DEMO_PAYROLL_PERIODS_STORAGE_KEY = 'smarthr.demo.payrollPeriods.v1'
export const DEMO_PAYROLL_ENTRIES_STORAGE_KEY = 'smarthr.demo.payrollEntries.v1'
export const DEMO_PAYROLL_AUDIT_STORAGE_KEY = 'smarthr.demo.payrollAudit.v1'

export interface DemoPayrollServiceOptions {
  employeeService?: EmployeeService
  attendanceService?: AttendanceService
  storage?: StorageLike | null
  now?: () => Date
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

function generateId(prefix: string): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCompensationRecord(value: unknown): value is CompensationRecord {
  if (!isObjectRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.employeeId === 'string' &&
    typeof value.employeeName === 'string' &&
    typeof value.department === 'string' &&
    typeof value.payBasis === 'string' &&
    typeof value.baseAmountCentavos === 'number' &&
    value.currency === 'PHP' &&
    Array.isArray(value.allowances) &&
    typeof value.effectiveDate === 'string' &&
    (value.endDate === null || typeof value.endDate === 'string') &&
    typeof value.status === 'string' &&
    typeof value.createdAtUtc === 'string'
  )
}

function isPayrollPeriod(value: unknown): value is PayrollPeriod {
  if (!isObjectRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.scheduleType === 'string' &&
    typeof value.periodStart === 'string' &&
    typeof value.periodEnd === 'string' &&
    typeof value.payDate === 'string' &&
    typeof value.status === 'string' &&
    typeof value.createdAtUtc === 'string'
  )
}

function isPayrollEntry(value: unknown): value is PayrollEntry {
  if (!isObjectRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.payrollPeriodId === 'string' &&
    typeof value.employeeId === 'string' &&
    typeof value.employeeName === 'string' &&
    Array.isArray(value.earnings) &&
    Array.isArray(value.deductions) &&
    typeof value.grossPayCentavos === 'number' &&
    typeof value.totalDeductionsCentavos === 'number' &&
    typeof value.netPayCentavos === 'number' &&
    typeof value.status === 'string'
  )
}

function isPayrollAuditEntry(value: unknown): value is PayrollAuditEntry {
  if (!isObjectRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.eventType === 'string' &&
    typeof value.actorEmployeeId === 'string' &&
    typeof value.summary === 'string' &&
    typeof value.timestampUtc === 'string'
  )
}

function cloneCompensation(item: CompensationRecord): CompensationRecord {
  return {
    ...item,
    allowances: item.allowances.map((a) => ({ ...a })),
  }
}

function cloneEntry(item: PayrollEntry): PayrollEntry {
  return {
    ...item,
    earnings: item.earnings.map((e) => ({ ...e })),
    deductions: item.deductions.map((d) => ({ ...d })),
    warnings: [...item.warnings],
    ruleSnapshot: { ...item.ruleSnapshot },
  }
}

export function createDemoPayrollService(
  options: DemoPayrollServiceOptions = {},
): PayrollService {
  const empService = options.employeeService ?? defaultEmployeeService
  const attService = options.attendanceService ?? defaultAttendanceService
  const now = options.now ?? (() => new Date())

  let fallbackCompensations: CompensationRecord[] = []
  let fallbackPeriods: PayrollPeriod[] = []
  let fallbackEntries: PayrollEntry[] = []
  let fallbackAudit: PayrollAuditEntry[] = []

  function resolveStorage(): StorageLike | null {
    if (options.storage !== undefined) {
      return options.storage
    }
    return getDefaultStorage()
  }

  function readArray<T>(
    key: string,
    guard: (v: unknown) => v is T,
    fallback: T[],
    errorLabel: string,
  ): T[] {
    const storage = resolveStorage()
    if (!storage) {
      return [...fallback]
    }
    let raw: string | null
    try {
      raw = storage.getItem(key)
    } catch {
      throw new PayrollServiceError(
        'PERSISTENCE_ERROR',
        `Unable to read ${errorLabel} from browser storage.`,
        500,
      )
    }
    if (raw === null) {
      return []
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || !parsed.every(guard)) {
        throw new Error('Corrupted format')
      }
      return parsed
    } catch {
      throw new PayrollServiceError(
        'PERSISTENCE_ERROR',
        `Stored ${errorLabel} data is corrupted.`,
        500,
      )
    }
  }

  function writeArray<T>(
    key: string,
    items: T[],
    setFallback: (next: T[]) => void,
    errorLabel: string,
  ): void {
    const storage = resolveStorage()
    if (!storage) {
      setFallback([...items])
      return
    }
    try {
      storage.setItem(key, JSON.stringify(items))
    } catch {
      throw new PayrollServiceError(
        'PERSISTENCE_ERROR',
        `Unable to save ${errorLabel} to browser storage.`,
        500,
      )
    }
  }

  function readCompensations(): CompensationRecord[] {
    return readArray(
      DEMO_COMPENSATION_STORAGE_KEY,
      isCompensationRecord,
      fallbackCompensations,
      'compensation records',
    ).map(cloneCompensation)
  }

  function writeCompensations(items: CompensationRecord[]): void {
    writeArray(
      DEMO_COMPENSATION_STORAGE_KEY,
      items.map(cloneCompensation),
      (next) => {
        fallbackCompensations = next
      },
      'compensation records',
    )
  }

  function readPeriods(): PayrollPeriod[] {
    return readArray(
      DEMO_PAYROLL_PERIODS_STORAGE_KEY,
      isPayrollPeriod,
      fallbackPeriods,
      'payroll periods',
    ).map((p) => ({ ...p }))
  }

  function writePeriods(items: PayrollPeriod[]): void {
    writeArray(
      DEMO_PAYROLL_PERIODS_STORAGE_KEY,
      items.map((p) => ({ ...p })),
      (next) => {
        fallbackPeriods = next
      },
      'payroll periods',
    )
  }

  function readEntries(): PayrollEntry[] {
    return readArray(
      DEMO_PAYROLL_ENTRIES_STORAGE_KEY,
      isPayrollEntry,
      fallbackEntries,
      'payroll entries',
    ).map(cloneEntry)
  }

  function writeEntries(items: PayrollEntry[]): void {
    writeArray(
      DEMO_PAYROLL_ENTRIES_STORAGE_KEY,
      items.map(cloneEntry),
      (next) => {
        fallbackEntries = next
      },
      'payroll entries',
    )
  }

  function readAuditEntries(): PayrollAuditEntry[] {
    return readArray(
      DEMO_PAYROLL_AUDIT_STORAGE_KEY,
      isPayrollAuditEntry,
      fallbackAudit,
      'payroll audit history',
    ).map((a) => ({ ...a }))
  }

  function appendPayrollAudit(
    entry: Omit<PayrollAuditEntry, 'id'>,
  ): PayrollAuditEntry {
    const created: PayrollAuditEntry = {
      id: generateId('pay-audit'),
      ...entry,
    }
    const existing = readAuditEntries()
    writeArray(
      DEMO_PAYROLL_AUDIT_STORAGE_KEY,
      [created, ...existing].slice(0, 200),
      (next) => {
        fallbackAudit = next
      },
      'payroll audit history',
    )
    return created
  }

  async function resolveActor(
    actor: PayrollActorContext | null | undefined,
  ): Promise<{ actorEmployee: Employee; allEmployees: Employee[] }> {
    const rawId = actor?.actorEmployeeId?.trim() ?? ''
    if (!rawId) {
      throw new PayrollServiceError(
        'UNAUTHORIZED',
        'An authenticated session is required to access payroll.',
        401,
      )
    }

    if (isSessionExpired(actor?.sessionExpiresAtUtc, now())) {
      throw new PayrollServiceError(
        'UNAUTHORIZED',
        'Your session has expired. Please sign in again.',
        401,
      )
    }

    let allEmployees: Employee[]
    try {
      allEmployees = await empService.listAllDirectoryForServiceInternal()
    } catch {
      throw new PayrollServiceError(
        'PERSISTENCE_ERROR',
        'Unable to read employee directory for payroll authorization.',
        500,
      )
    }

    const actorKey = normalizeEmployeeId(rawId)
    const actorEmployee = allEmployees.find(
      (emp) => normalizeEmployeeId(emp.employeeId) === actorKey,
    )

    if (!actorEmployee) {
      throw new PayrollServiceError(
        'UNAUTHORIZED',
        'Current session identity does not match an existing employee account.',
        401,
      )
    }

    if (actorEmployee.employmentStatus === 'Inactive') {
      throw new PayrollServiceError(
        'EMPLOYEE_INACTIVE',
        'Inactive employee accounts cannot access payroll workflows.',
        403,
      )
    }

    return { actorEmployee, allEmployees }
  }

  function recordSecurityDenial(
    eventType: 'COMPENSATION_DENIED' | 'PAYROLL_ACCESS_DENIED',
    actorEmployee: Employee,
    targetEmployeeId: string | null,
    summary: string,
  ): void {
    appendSecurityAuditEvent(
      {
        eventType,
        actorEmployeeId: actorEmployee.employeeId,
        actorRole: actorEmployee.assignedRole,
        targetEmployeeId,
        summary,
        timestampUtc: now().toISOString(),
      },
      resolveStorage(),
    )
  }

  return {
    isDemoMode: true,
    businessTimezone: BUSINESS_TIMEZONE,
    statutoryDeductionsEnabled: false,
    finalApprovalEnabled: false,

    async listCompensationRecords(
      actor: PayrollActorContext,
    ): Promise<CompensationRecord[]> {
      const { actorEmployee, allEmployees } = await resolveActor(actor)
      if (
        !hasPermission(actorEmployee, 'payroll.view') &&
        !hasPermission(actorEmployee, 'compensation.manage')
      ) {
        recordSecurityDenial(
          'COMPENSATION_DENIED',
          actorEmployee,
          null,
          'Denied unauthorized compensation directory access',
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You are not authorized to view organization compensation records.',
          403,
        )
      }

      const empByKey = new Map(
        allEmployees.map((emp) => [normalizeEmployeeId(emp.employeeId), emp]),
      )
      return readCompensations()
        .map((rec) => {
          const emp = empByKey.get(normalizeEmployeeId(rec.employeeId))
          return emp
            ? {
                ...rec,
                employeeName: emp.fullName,
                department: emp.department,
              }
            : rec
        })
        .sort(
          (a, b) =>
            b.effectiveDate.localeCompare(a.effectiveDate) ||
            Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc),
        )
    },

    async createCompensationRecord(
      input: CreateCompensationInput,
      actor: PayrollActorContext,
    ): Promise<CompensationRecord> {
      const { actorEmployee, allEmployees } = await resolveActor(actor)

      if (!hasPermission(actorEmployee, 'compensation.manage')) {
        recordSecurityDenial(
          'COMPENSATION_DENIED',
          actorEmployee,
          input.employeeId ?? null,
          'Denied unauthorized compensation edit attempt',
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'Only authorized HR personnel can manage employee compensation.',
          403,
        )
      }

      const validated = validateCreateCompensationInput(input)
      if (!validated.success) {
        throw new PayrollServiceError(
          'VALIDATION_ERROR',
          validated.message,
          400,
          validated.fieldErrors as Record<string, string>,
        )
      }

      const targetKey = normalizeEmployeeId(validated.data.employeeId)
      const targetEmployee = allEmployees.find(
        (emp) => normalizeEmployeeId(emp.employeeId) === targetKey,
      )

      if (!targetEmployee) {
        throw new PayrollServiceError(
          'EMPLOYEE_NOT_FOUND',
          `Employee "${validated.data.employeeId}" was not found.`,
          404,
        )
      }

      if (targetEmployee.employmentStatus === 'Inactive') {
        throw new PayrollServiceError(
          'EMPLOYEE_INACTIVE',
          'Cannot create active compensation for an Inactive employee.',
          403,
        )
      }

      const existing = readCompensations()
      const employeeHistory = existing.filter(
        (rec) =>
          normalizeEmployeeId(rec.employeeId) === targetKey &&
          rec.status !== 'Inactive',
      )

      const duplicateEffective = employeeHistory.find(
        (rec) => rec.effectiveDate === validated.data.effectiveDate,
      )
      if (duplicateEffective) {
        throw new PayrollServiceError(
          'DUPLICATE_EFFECTIVE_DATE',
          `${targetEmployee.fullName} already has a compensation record effective ${validated.data.effectiveDate}. Choose a different effective date to preserve history.`,
          409,
        )
      }

      const nowIso = now().toISOString()

      // Determine whether a newer compensation record already exists after this effectiveDate
      const laterRecords = employeeHistory
        .filter((rec) => rec.effectiveDate > validated.data.effectiveDate)
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))

      let resolvedEndDate = validated.data.endDate
      let resolvedStatus: CompensationRecord['status'] = 'Active'

      if (laterRecords.length > 0) {
        const nextLaterDate = laterRecords[0].effectiveDate
        const maxHistoricalEnd = subtractOneCalendarDay(nextLaterDate)
        if (resolvedEndDate === null || resolvedEndDate >= nextLaterDate) {
          resolvedEndDate = maxHistoricalEnd
        }
        resolvedStatus = 'Superseded'
      }

      // Close open prior active records without mutating their historical salary amounts
      let supersededCount = 0
      const updatedExisting = existing.map((rec) => {
        if (
          normalizeEmployeeId(rec.employeeId) === targetKey &&
          rec.status === 'Active' &&
          rec.effectiveDate < validated.data.effectiveDate &&
          (rec.endDate === null ||
            rec.endDate >= validated.data.effectiveDate)
        ) {
          supersededCount += 1
          return {
            ...rec,
            endDate: subtractOneCalendarDay(validated.data.effectiveDate),
            status: 'Superseded' as const,
            updatedAtUtc: nowIso,
          }
        }
        return rec
      })

      const created: CompensationRecord = {
        id: generateId('comp'),
        employeeId: targetEmployee.employeeId,
        employeeName: targetEmployee.fullName,
        department: targetEmployee.department,
        payBasis: validated.data.payBasis,
        baseAmountCentavos: validated.data.baseAmountCentavos,
        currency: 'PHP',
        allowances: validated.data.allowances.map((a, idx) => ({
          id: generateId(`allow-${idx}`),
          label: a.label,
          amountCentavos: a.amountCentavos,
        })),
        effectiveDate: validated.data.effectiveDate,
        endDate: resolvedEndDate,
        status: resolvedStatus,
        notes: validated.data.notes,
        createdByEmployeeId: actorEmployee.employeeId,
        createdByRole: actorEmployee.assignedRole,
        createdAtUtc: nowIso,
        updatedAtUtc: nowIso,
      }

      writeCompensations([created, ...updatedExisting])

      appendPayrollAudit({
        eventType: 'COMPENSATION_CREATED',
        actorEmployeeId: actorEmployee.employeeId,
        actorName: actorEmployee.fullName,
        actorRole: actorEmployee.assignedRole,
        targetEmployeeId: targetEmployee.employeeId,
        payrollPeriodId: null,
        summary: `Configured ${created.payBasis} compensation effective ${created.effectiveDate}${supersededCount > 0 ? ` (superseded ${supersededCount} prior active record)` : ''}`,
        timestampUtc: nowIso,
      })

      appendSecurityAuditEvent(
        {
          eventType: 'COMPENSATION_CREATED',
          actorEmployeeId: actorEmployee.employeeId,
          actorRole: actorEmployee.assignedRole,
          targetEmployeeId: targetEmployee.employeeId,
          summary: `Created ${created.payBasis} compensation record effective ${created.effectiveDate}`,
          timestampUtc: nowIso,
        },
        resolveStorage(),
      )

      return cloneCompensation(created)
    },

    async listPayrollPeriods(
      actor: PayrollActorContext,
    ): Promise<PayrollPeriod[]> {
      const { actorEmployee } = await resolveActor(actor)
      if (!hasPermission(actorEmployee, 'payroll.view')) {
        recordSecurityDenial(
          'PAYROLL_ACCESS_DENIED',
          actorEmployee,
          null,
          'Denied unauthorized payroll period list access',
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You are not authorized to inspect organization payroll periods.',
          403,
        )
      }

      return readPeriods().sort(
        (a, b) =>
          b.periodStart.localeCompare(a.periodStart) ||
          Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc),
      )
    },

    async createPayrollPeriod(
      input: CreatePayrollPeriodInput,
      actor: PayrollActorContext,
    ): Promise<PayrollPeriod> {
      const { actorEmployee } = await resolveActor(actor)
      if (!hasPermission(actorEmployee, 'payroll.create')) {
        recordSecurityDenial(
          'PAYROLL_ACCESS_DENIED',
          actorEmployee,
          null,
          'Denied unauthorized payroll period creation attempt',
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You do not have permission to create payroll periods.',
          403,
        )
      }

      const validated = validateCreatePayrollPeriodInput(input)
      if (!validated.success) {
        throw new PayrollServiceError(
          'VALIDATION_ERROR',
          validated.message,
          400,
          validated.fieldErrors as Record<string, string>,
        )
      }

      const existing = readPeriods()
      const duplicate = existing.find(
        (p) =>
          p.scheduleType === validated.data.scheduleType &&
          p.periodStart <= validated.data.periodEnd &&
          p.periodEnd >= validated.data.periodStart,
      )
      if (duplicate) {
        throw new PayrollServiceError(
          'DUPLICATE_PAYROLL_PERIOD',
          `Overlapping ${validated.data.scheduleType} payroll period already exists (${duplicate.periodStart} to ${duplicate.periodEnd}).`,
          409,
        )
      }

      const nowIso = now().toISOString()
      const created: PayrollPeriod = {
        id: generateId('period'),
        label: validated.data.label,
        scheduleType: validated.data.scheduleType,
        periodStart: validated.data.periodStart,
        periodEnd: validated.data.periodEnd,
        payDate: validated.data.payDate,
        status: 'Draft',
        businessTimezone: BUSINESS_TIMEZONE,
        createdByEmployeeId: actorEmployee.employeeId,
        createdByName: actorEmployee.fullName,
        createdByRole: actorEmployee.assignedRole,
        createdAtUtc: nowIso,
        updatedAtUtc: nowIso,
        reviewedByEmployeeId: null,
        reviewedByName: null,
        reviewedAtUtc: null,
        reviewNotes: null,
      }

      writePeriods([created, ...existing])

      appendPayrollAudit({
        eventType: 'PAYROLL_PERIOD_CREATED',
        actorEmployeeId: actorEmployee.employeeId,
        actorName: actorEmployee.fullName,
        actorRole: actorEmployee.assignedRole,
        targetEmployeeId: null,
        payrollPeriodId: created.id,
        summary: `Created ${created.scheduleType} payroll period ${created.periodStart} to ${created.periodEnd} (pay date ${created.payDate})`,
        timestampUtc: nowIso,
      })

      appendSecurityAuditEvent(
        {
          eventType: 'PAYROLL_PERIOD_CREATED',
          actorEmployeeId: actorEmployee.employeeId,
          actorRole: actorEmployee.assignedRole,
          targetEmployeeId: null,
          summary: `Created ${created.scheduleType} payroll period ${created.label}`,
          timestampUtc: nowIso,
        },
        resolveStorage(),
      )

      return { ...created }
    },

    async generateDraftPayroll(
      periodId: string,
      actor: PayrollActorContext,
    ): Promise<DraftPayrollGenerationResult> {
      const { actorEmployee, allEmployees } = await resolveActor(actor)
      if (!hasPermission(actorEmployee, 'payroll.calculate')) {
        recordSecurityDenial(
          'PAYROLL_ACCESS_DENIED',
          actorEmployee,
          null,
          'Denied unauthorized draft payroll generation attempt',
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You do not have permission to generate or calculate payroll.',
          403,
        )
      }

      const periods = readPeriods()
      const period = periods.find((p) => p.id === periodId)
      if (!period) {
        throw new PayrollServiceError(
          'PERIOD_NOT_FOUND',
          'Selected payroll period was not found.',
          404,
        )
      }

      if (period.status !== 'Draft') {
        throw new PayrollServiceError(
          'INVALID_STATUS_TRANSITION',
          `Payroll period "${period.label}" is ${period.status} and cannot regenerate draft entries.`,
          409,
        )
      }

      const compensations = readCompensations()
      const allEntries = readEntries()
      const existingPeriodEntries = allEntries.filter(
        (entry) => entry.payrollPeriodId === period.id,
      )
      const existingEmpKeys = new Set(
        existingPeriodEntries.map((entry) =>
          normalizeEmployeeId(entry.employeeId),
        ),
      )

      const attendanceRecords = await attService.listAttendanceRecords(actor)
      const attendanceCountByEmp = new Map<string, number>()
      for (const att of attendanceRecords) {
        if (
          att.attendanceDate >= period.periodStart &&
          att.attendanceDate <= period.periodEnd
        ) {
          const key = normalizeEmployeeId(att.employeeId)
          attendanceCountByEmp.set(key, (attendanceCountByEmp.get(key) ?? 0) + 1)
        }
      }

      const eligibleEmployees = allEmployees.filter(
        (emp) => emp.employmentStatus !== 'Inactive',
      )

      const nowIso = now().toISOString()
      const newlyAddedEntries: PayrollEntry[] = []
      const missingCompensationWarnings: MissingCompensationWarning[] = []
      let preservedExistingCount = 0

      for (const emp of eligibleEmployees) {
        const empKey = normalizeEmployeeId(emp.employeeId)
        if (existingEmpKeys.has(empKey)) {
          preservedExistingCount += 1
          continue
        }

        const effectiveComp = resolveEffectiveCompensation(
          compensations,
          emp.employeeId,
          period.periodEnd,
        )

        if (!effectiveComp) {
          missingCompensationWarnings.push({
            employeeId: emp.employeeId,
            employeeName: emp.fullName,
            department: emp.department,
            reason: `No active compensation record effective on or before ${period.periodEnd}.`,
          })
          continue
        }

        const entryId = generateId('pay')
        const sessionsCount = attendanceCountByEmp.get(empKey) ?? 0
        const calculated = calculateDraftPayrollTotals({
          entryIdPrefix: entryId,
          compensation: effectiveComp,
          scheduleType: period.scheduleType,
          confirmedPayableUnitsHundredths: null,
          attendanceSessionsInPeriod: sessionsCount,
          manualAdjustments: [],
        })

        newlyAddedEntries.push({
          id: entryId,
          payrollPeriodId: period.id,
          periodLabel: period.label,
          scheduleType: period.scheduleType,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          payDate: period.payDate,
          employeeId: emp.employeeId,
          employeeName: emp.fullName,
          department: emp.department,
          compensationId: effectiveComp.id,
          payBasis: effectiveComp.payBasis,
          baseCompensationCentavos: effectiveComp.baseAmountCentavos,
          currency: 'PHP',
          confirmedPayableUnitsHundredths: null,
          attendanceSessionsInPeriod: sessionsCount,
          earnings: calculated.earnings,
          deductions: calculated.deductions,
          grossPayCentavos: calculated.grossPayCentavos,
          totalDeductionsCentavos: calculated.totalDeductionsCentavos,
          netPayCentavos: calculated.netPayCentavos,
          status: 'Draft',
          requiresReview: calculated.requiresReview,
          hasNegativeNetPay: calculated.hasNegativeNetPay,
          warnings: calculated.warnings,
          ruleSnapshot: calculated.ruleSnapshot,
          createdAtUtc: nowIso,
          updatedAtUtc: nowIso,
        })
      }

      if (newlyAddedEntries.length > 0) {
        writeEntries([...newlyAddedEntries, ...allEntries])
      }

      const combinedPeriodEntries = [
        ...newlyAddedEntries,
        ...existingPeriodEntries,
      ]
        .map(cloneEntry)
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName))

      appendPayrollAudit({
        eventType: 'PAYROLL_DRAFT_GENERATED',
        actorEmployeeId: actorEmployee.employeeId,
        actorName: actorEmployee.fullName,
        actorRole: actorEmployee.assignedRole,
        targetEmployeeId: null,
        payrollPeriodId: period.id,
        summary: `Draft payroll run for ${period.label}: ${newlyAddedEntries.length} generated, ${preservedExistingCount} preserved, ${missingCompensationWarnings.length} missing compensation`,
        timestampUtc: nowIso,
      })

      appendSecurityAuditEvent(
        {
          eventType: 'PAYROLL_DRAFT_GENERATED',
          actorEmployeeId: actorEmployee.employeeId,
          actorRole: actorEmployee.assignedRole,
          targetEmployeeId: null,
          summary: `Generated draft payroll entries for period ${period.label}`,
          timestampUtc: nowIso,
        },
        resolveStorage(),
      )

      return {
        period: { ...period },
        generatedEntries: combinedPeriodEntries,
        addedCount: newlyAddedEntries.length,
        preservedExistingCount,
        missingCompensationWarnings,
      }
    },

    async listPayrollEntriesForPeriod(
      periodId: string,
      actor: PayrollActorContext,
    ): Promise<PayrollEntry[]> {
      const { actorEmployee } = await resolveActor(actor)
      if (!hasPermission(actorEmployee, 'payroll.view')) {
        recordSecurityDenial(
          'PAYROLL_ACCESS_DENIED',
          actorEmployee,
          null,
          'Denied unauthorized period payroll entries query',
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You are not authorized to inspect payroll entries for other employees.',
          403,
        )
      }

      const periods = readPeriods()
      if (!periods.some((p) => p.id === periodId)) {
        throw new PayrollServiceError(
          'PERIOD_NOT_FOUND',
          'Requested payroll period was not found.',
          404,
        )
      }

      return readEntries()
        .filter((entry) => entry.payrollPeriodId === periodId)
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName))
    },

    async setConfirmedPayableUnits(
      input: SetConfirmedPayableUnitsInput,
      actor: PayrollActorContext,
    ): Promise<PayrollEntry> {
      const { actorEmployee } = await resolveActor(actor)
      if (!hasPermission(actorEmployee, 'payroll.calculate')) {
        recordSecurityDenial(
          'PAYROLL_ACCESS_DENIED',
          actorEmployee,
          null,
          'Denied unauthorized payable units edit',
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You do not have permission to update payable payroll units.',
          403,
        )
      }

      const validated = validateConfirmedPayableUnitsInput(input.unitsInput)
      if (!validated.success) {
        throw new PayrollServiceError('VALIDATION_ERROR', validated.message, 400)
      }

      const entries = readEntries()
      const idx = entries.findIndex((e) => e.id === input.entryId)
      if (idx === -1) {
        throw new PayrollServiceError(
          'ENTRY_NOT_FOUND',
          'Draft payroll entry was not found.',
          404,
        )
      }

      const existing = entries[idx]
      const period = readPeriods().find((p) => p.id === existing.payrollPeriodId)
      if (!period || period.status !== 'Draft' || existing.status !== 'Draft') {
        throw new PayrollServiceError(
          'INVALID_STATUS_TRANSITION',
          'Cannot modify payroll entry once its period is no longer in Draft status.',
          409,
        )
      }

      if (existing.payBasis === 'Monthly') {
        throw new PayrollServiceError(
          'VALIDATION_ERROR',
          'Confirmed payable units apply only to Daily or Hourly compensation bases.',
          400,
        )
      }

      const compensation = readCompensations().find(
        (c) => c.id === existing.compensationId,
      )
      if (!compensation) {
        throw new PayrollServiceError(
          'COMPENSATION_NOT_FOUND',
          'Linked compensation snapshot was not found.',
          404,
        )
      }

      const manualAdjustments = [
        ...existing.earnings.filter(
          (item) => item.source === 'Authorized Adjustment',
        ),
        ...existing.deductions.filter(
          (item) => item.source === 'Authorized Adjustment',
        ),
      ]

      const recalculated = calculateDraftPayrollTotals({
        entryIdPrefix: existing.id,
        compensation,
        scheduleType: existing.scheduleType,
        confirmedPayableUnitsHundredths: validated.unitsHundredths,
        attendanceSessionsInPeriod: existing.attendanceSessionsInPeriod,
        manualAdjustments,
      })

      const nowIso = now().toISOString()
      const updated: PayrollEntry = {
        ...existing,
        confirmedPayableUnitsHundredths: validated.unitsHundredths,
        earnings: recalculated.earnings,
        deductions: recalculated.deductions,
        grossPayCentavos: recalculated.grossPayCentavos,
        totalDeductionsCentavos: recalculated.totalDeductionsCentavos,
        netPayCentavos: recalculated.netPayCentavos,
        requiresReview: recalculated.requiresReview,
        hasNegativeNetPay: recalculated.hasNegativeNetPay,
        warnings: recalculated.warnings,
        ruleSnapshot: recalculated.ruleSnapshot,
        updatedAtUtc: nowIso,
      }

      writeEntries(entries.map((item, i) => (i === idx ? updated : item)))

      appendPayrollAudit({
        eventType: 'PAYROLL_UNITS_CONFIRMED',
        actorEmployeeId: actorEmployee.employeeId,
        actorName: actorEmployee.fullName,
        actorRole: actorEmployee.assignedRole,
        targetEmployeeId: updated.employeeId,
        payrollPeriodId: updated.payrollPeriodId,
        summary: `Confirmed ${formatHundredths(validated.unitsHundredths)} payable units for ${updated.payBasis} draft entry`,
        timestampUtc: nowIso,
      })

      return cloneEntry(updated)
    },

    async addManualAdjustment(
      input: AddManualAdjustmentInput,
      actor: PayrollActorContext,
    ): Promise<PayrollEntry> {
      const { actorEmployee } = await resolveActor(actor)
      if (!hasPermission(actorEmployee, 'payroll.calculate')) {
        recordSecurityDenial(
          'PAYROLL_ACCESS_DENIED',
          actorEmployee,
          null,
          'Denied unauthorized payroll adjustment attempt',
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You do not have permission to add payroll adjustments.',
          403,
        )
      }

      const validated = validateManualAdjustmentInput(input)
      if (!validated.success) {
        throw new PayrollServiceError('VALIDATION_ERROR', validated.message, 400)
      }

      const entries = readEntries()
      const idx = entries.findIndex((e) => e.id === validated.data.entryId)
      if (idx === -1) {
        throw new PayrollServiceError(
          'ENTRY_NOT_FOUND',
          'Draft payroll entry was not found.',
          404,
        )
      }

      const existing = entries[idx]
      const period = readPeriods().find((p) => p.id === existing.payrollPeriodId)
      if (!period || period.status !== 'Draft' || existing.status !== 'Draft') {
        throw new PayrollServiceError(
          'INVALID_STATUS_TRANSITION',
          'Cannot add adjustments once the payroll period has left Draft status.',
          409,
        )
      }

      const existingManuals = [
        ...existing.earnings.filter(
          (item) => item.source === 'Authorized Adjustment',
        ),
        ...existing.deductions.filter(
          (item) => item.source === 'Authorized Adjustment',
        ),
      ]

      if (
        existingManuals.some(
          (item) => item.adjustmentKey === validated.data.adjustmentKey,
        )
      ) {
        throw new PayrollServiceError(
          'DUPLICATE_ADJUSTMENT',
          `Duplicate adjustment "${validated.data.label}" (${validated.data.category}) already exists on this payroll entry.`,
          409,
        )
      }

      const compensation = readCompensations().find(
        (c) => c.id === existing.compensationId,
      )
      if (!compensation) {
        throw new PayrollServiceError(
          'COMPENSATION_NOT_FOUND',
          'Linked compensation snapshot was not found.',
          404,
        )
      }

      const newLine: PayrollLineItem = {
        id: generateId('adj'),
        category: validated.data.category,
        code:
          validated.data.category === 'Earning'
            ? 'MANUAL_EARNING'
            : 'MANUAL_DEDUCTION',
        label: validated.data.label,
        amountCentavos: validated.data.amountCentavos,
        source: 'Authorized Adjustment',
        adjustmentKey: validated.data.adjustmentKey,
      }

      const recalculated = calculateDraftPayrollTotals({
        entryIdPrefix: existing.id,
        compensation,
        scheduleType: existing.scheduleType,
        confirmedPayableUnitsHundredths: existing.confirmedPayableUnitsHundredths,
        attendanceSessionsInPeriod: existing.attendanceSessionsInPeriod,
        manualAdjustments: [...existingManuals, newLine],
      })

      const nowIso = now().toISOString()
      const updated: PayrollEntry = {
        ...existing,
        earnings: recalculated.earnings,
        deductions: recalculated.deductions,
        grossPayCentavos: recalculated.grossPayCentavos,
        totalDeductionsCentavos: recalculated.totalDeductionsCentavos,
        netPayCentavos: recalculated.netPayCentavos,
        requiresReview: recalculated.requiresReview,
        hasNegativeNetPay: recalculated.hasNegativeNetPay,
        warnings: recalculated.warnings,
        ruleSnapshot: recalculated.ruleSnapshot,
        updatedAtUtc: nowIso,
      }

      writeEntries(entries.map((item, i) => (i === idx ? updated : item)))

      appendPayrollAudit({
        eventType: 'PAYROLL_ADJUSTMENT_ADDED',
        actorEmployeeId: actorEmployee.employeeId,
        actorName: actorEmployee.fullName,
        actorRole: actorEmployee.assignedRole,
        targetEmployeeId: updated.employeeId,
        payrollPeriodId: updated.payrollPeriodId,
        summary: `Added ${validated.data.category} adjustment "${validated.data.label}" to draft period ${updated.periodLabel}`,
        timestampUtc: nowIso,
      })

      appendSecurityAuditEvent(
        {
          eventType: 'PAYROLL_ADJUSTMENT_ADDED',
          actorEmployeeId: actorEmployee.employeeId,
          actorRole: actorEmployee.assignedRole,
          targetEmployeeId: updated.employeeId,
          summary: `Added ${validated.data.category} adjustment to draft payroll`,
          timestampUtc: nowIso,
        },
        resolveStorage(),
      )

      return cloneEntry(updated)
    },

    async markPeriodInReview(
      periodId: string,
      reviewNotes: string | undefined,
      actor: PayrollActorContext,
    ): Promise<PayrollPeriod> {
      const { actorEmployee } = await resolveActor(actor)
      if (!hasPermission(actorEmployee, 'payroll.review')) {
        recordSecurityDenial(
          'PAYROLL_ACCESS_DENIED',
          actorEmployee,
          null,
          'Denied unauthorized payroll review transition',
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You do not have permission to submit payroll periods for review.',
          403,
        )
      }

      const periods = readPeriods()
      const pIdx = periods.findIndex((p) => p.id === periodId)
      if (pIdx === -1) {
        throw new PayrollServiceError(
          'PERIOD_NOT_FOUND',
          'Payroll period was not found.',
          404,
        )
      }

      const existingPeriod = periods[pIdx]
      if (existingPeriod.status !== 'Draft') {
        throw new PayrollServiceError(
          'INVALID_STATUS_TRANSITION',
          `Payroll period is already ${existingPeriod.status}.`,
          409,
        )
      }

      const entries = readEntries()
      const periodEntries = entries.filter((e) => e.payrollPeriodId === periodId)
      if (periodEntries.length === 0) {
        throw new PayrollServiceError(
          'VALIDATION_ERROR',
          'Generate draft payroll entries before submitting the period for review.',
          400,
        )
      }

      const nowIso = now().toISOString()
      const updatedPeriod: PayrollPeriod = {
        ...existingPeriod,
        status: 'In Review',
        updatedAtUtc: nowIso,
        reviewedByEmployeeId: actorEmployee.employeeId,
        reviewedByName: actorEmployee.fullName,
        reviewedAtUtc: nowIso,
        reviewNotes: reviewNotes?.trim() || null,
      }

      const updatedEntries = entries.map((entry) =>
        entry.payrollPeriodId === periodId
          ? { ...entry, status: 'In Review' as const, updatedAtUtc: nowIso }
          : entry,
      )

      writePeriods(periods.map((p, i) => (i === pIdx ? updatedPeriod : p)))
      writeEntries(updatedEntries)

      appendPayrollAudit({
        eventType: 'PAYROLL_MARKED_IN_REVIEW',
        actorEmployeeId: actorEmployee.employeeId,
        actorName: actorEmployee.fullName,
        actorRole: actorEmployee.assignedRole,
        targetEmployeeId: null,
        payrollPeriodId: updatedPeriod.id,
        summary: `Marked payroll period ${updatedPeriod.label} as In Review (${periodEntries.length} draft entries locked)`,
        timestampUtc: nowIso,
      })

      appendSecurityAuditEvent(
        {
          eventType: 'PAYROLL_MARKED_IN_REVIEW',
          actorEmployeeId: actorEmployee.employeeId,
          actorRole: actorEmployee.assignedRole,
          targetEmployeeId: null,
          summary: `Locked payroll period ${updatedPeriod.label} for review`,
          timestampUtc: nowIso,
        },
        resolveStorage(),
      )

      return { ...updatedPeriod }
    },

    async approvePayrollPeriod(
      periodId: string,
      actor: PayrollActorContext,
    ): Promise<PayrollPeriod> {
      const { actorEmployee } = await resolveActor(actor)
      recordSecurityDenial(
        'PAYROLL_ACCESS_DENIED',
        actorEmployee,
        null,
        `Blocked final payroll approval attempt on period ${periodId} (Phase 6B policy unconfigured)`,
      )
      throw new PayrollServiceError(
        'APPROVAL_POLICY_UNCONFIGURED',
        'Final payroll approval and payment disbursement are disabled until company approval policies and statutory compliance are verified (Phase 6B).',
        403,
      )
    },

    async listMyPayslips(actor: PayrollActorContext): Promise<PayrollEntry[]> {
      const { actorEmployee } = await resolveActor(actor)
      if (!hasPermission(actorEmployee, 'payroll.view_own')) {
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You do not have permission to view personal payslips.',
          403,
        )
      }

      const actorKey = normalizeEmployeeId(actorEmployee.employeeId)
      return readEntries()
        .filter((entry) => normalizeEmployeeId(entry.employeeId) === actorKey)
        .sort(
          (a, b) =>
            b.payDate.localeCompare(a.payDate) ||
            b.periodEnd.localeCompare(a.periodEnd),
        )
    },

    async getPayslipEntryById(
      entryId: string,
      actor: PayrollActorContext,
    ): Promise<PayrollEntry> {
      const { actorEmployee } = await resolveActor(actor)
      const entry = readEntries().find((e) => e.id === entryId)
      if (!entry) {
        throw new PayrollServiceError(
          'ENTRY_NOT_FOUND',
          'Payslip record was not found.',
          404,
        )
      }

      if (!canViewPayrollEntry(actorEmployee, entry.employeeId)) {
        recordSecurityDenial(
          'PAYROLL_ACCESS_DENIED',
          actorEmployee,
          entry.employeeId,
          `Denied cross-employee payslip inspection for ${entry.employeeId}`,
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You are not authorized to view another employee’s payslip.',
          403,
        )
      }

      return cloneEntry(entry)
    },

    async listPayrollAuditHistory(
      actor: PayrollActorContext,
    ): Promise<PayrollAuditEntry[]> {
      const { actorEmployee } = await resolveActor(actor)
      if (!hasPermission(actorEmployee, 'payroll.view')) {
        recordSecurityDenial(
          'PAYROLL_ACCESS_DENIED',
          actorEmployee,
          null,
          'Denied unauthorized payroll audit log access',
        )
        throw new PayrollServiceError(
          'UNAUTHORIZED',
          'You are not authorized to inspect payroll audit history.',
          403,
        )
      }

      return readAuditEntries()
    },
  }
}

export const payrollService: PayrollService = isBackendApiConfigured()
  ? createApiPayrollService()
  : createDemoPayrollService()

