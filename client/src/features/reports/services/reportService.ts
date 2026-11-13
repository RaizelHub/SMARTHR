import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import {
  DEPARTMENTS,
  EMPLOYMENT_STATUSES,
  type Department,
  type Employee,
  type EmploymentStatus,
} from '../../../types/employee'
import {
  LEAVE_REQUEST_STATUSES,
  LEAVE_TYPES,
  type LeaveRequestStatus,
  type LeaveType,
} from '../../../types/leave'
import type {
  AttendanceAnalyticsSummary,
  AttendanceDailyTrendItem,
  AttendanceLeaveOverlapItem,
  AttendanceReportRow,
  AuthorizedReportScope,
  CsvExportDataset,
  CsvExportResult,
  DepartmentAttendanceItem,
  DepartmentHeadcountItem,
  EmployeeAnalyticsSummary,
  EmployeeAttendanceSummaryItem,
  EmployeeReportRow,
  LeaveAnalyticsSummary,
  LeaveDepartmentBreakdownItem,
  LeaveMonthlyTrendItem,
  LeaveReportRow,
  LeaveTypeBreakdownItem,
  NormalizedReportFilters,
  ReportActorContext,
  ReportFilterInput,
  ReportMetricDefinition,
  ScopedEmployeeFilterOption,
  StatusBreakdownItem,
  WorkforceReport,
} from '../../../types/report'
import { isBackendApiConfigured } from '../../api/httpClient'
import {
  attendanceService as defaultAttendanceService,
  AttendanceServiceError,
  DEMO_ATTENDANCE_STORAGE_KEY,
  type AttendanceService,
} from '../../attendance/services/attendanceService'
import {
  getBusinessDateString,
  isOvernightShift,
} from '../../attendance/utils/timeZone'
import {
  canExportReports,
  getReportScope,
} from '../../auth/permissions'
import { isSessionExpired } from '../../auth/securityAudit'
import {
  DEMO_EMPLOYEES_STORAGE_KEY,
  employeeService as defaultEmployeeService,
  EmployeeServiceError,
  type EmployeeService,
  type StorageLike,
} from '../../employees/services/employeeService'
import {
  isValidCalendarDate,
  normalizeEmployeeId,
} from '../../employees/validation/employeeSchema'
import {
  DEMO_LEAVE_STORAGE_KEY,
  leaveService as defaultLeaveService,
  LeaveServiceError,
  type LeaveService,
} from '../../leave/services/leaveService'
import { doDateRangesOverlap } from '../../leave/validation/leaveSchema'
import {
  buildAttendanceReportCsv,
  buildEmployeeReportCsv,
  buildLeaveReportCsv,
} from '../utils/csvExport'
import { createApiReportService } from './reportApiService'

/**
 * DEMO-ONLY CLIENT-SIDE ANALYTICS SERVICE
 *
 * Smart HR has no connected backend server, SQL database, or payroll engine.
 * Reports are aggregated client-side from localStorage datasets scoped by
 * Phase 4 RBAC rules. Production deployment requires server-side RBAC
 * authorization checks, indexed SQL aggregations, and rate-limited streaming
 * exports.
 */
export const DEFAULT_MAX_EXPORT_ROWS = 5000

export const REPORT_METRIC_DEFINITIONS: readonly ReportMetricDefinition[] = [
  {
    metric: 'Total Workforce (Filtered Directory)',
    definition:
      'Count of employee directory records matching the active Department, Employee, and Employment Status filters within your authorized role scope.',
  },
  {
    metric: 'New Hires in Period',
    definition:
      'Count of filtered employees whose hireDate (YYYY-MM-DD) falls inclusively within the selected Start Date and End Date filters.',
  },
  {
    metric: 'Attendance Sessions & Attribution Date',
    definition:
      'Each attendance record is attributed once to its Asia/Manila clock-in calendar date (attendanceDate). Overnight shifts crossing midnight are counted on their clock-in shift date only and never double-counted.',
  },
  {
    metric: 'Raw Recorded Shift Duration',
    definition:
      'Sum of elapsed minutes for completed Clocked Out sessions (excluding open Clocked In sessions without clockOutAtUtc). Raw duration is not equivalent to payable, regular, or overtime payroll hours.',
  },
  {
    metric: 'Absences & Tardiness',
    definition:
      'Not calculated. Company work schedules, shift start/end times, and absence/tardiness rules are not configured in Smart HR.',
  },
  {
    metric: 'Leave Requests & Overlap Filtering',
    definition:
      'Leave requests are counted once when their [startDate, endDate] overlaps the selected report date range. Cancelled and Rejected requests are tracked separately from Approved requests.',
  },
  {
    metric: 'Leave Balances & Entitlements',
    definition:
      'Not calculated. Approved calendar days represent total inclusive calendar dates requested without weekend/holiday exclusions or balance deductions.',
  },
] as const

export type ReportServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'EMPLOYEE_INACTIVE'
  | 'VALIDATION_ERROR'
  | 'EXPORT_LIMIT_EXCEEDED'
  | 'PERSISTENCE_ERROR'

export class ReportServiceError extends Error {
  readonly code: ReportServiceErrorCode
  readonly httpStatus: 400 | 401 | 403 | 500

  constructor(
    code: ReportServiceErrorCode,
    message: string,
    httpStatus?: 400 | 401 | 403 | 500,
  ) {
    super(message)
    this.name = 'ReportServiceError'
    this.code = code
    this.httpStatus =
      httpStatus ??
      (code === 'UNAUTHORIZED' || code === 'EMPLOYEE_INACTIVE'
        ? 403
        : code === 'PERSISTENCE_ERROR'
          ? 500
          : 400)
  }
}

export interface DemoReportServiceOptions {
  employeeService?: EmployeeService
  attendanceService?: AttendanceService
  leaveService?: LeaveService
  storage?: StorageLike | null
  now?: () => Date
  maxExportRows?: number
}

export interface ReportService {
  readonly isDemoMode: boolean
  readonly businessTimezone: string
  readonly maxExportRows: number
  generateReport(
    filters: ReportFilterInput | undefined,
    actor: ReportActorContext,
  ): Promise<WorkforceReport>
  exportReportCsv(
    dataset: CsvExportDataset,
    filters: ReportFilterInput | undefined,
    actor: ReportActorContext,
  ): Promise<CsvExportResult>
  invalidateCache(): void
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

function translateDomainError(error: unknown, fallbackMessage: string): ReportServiceError {
  if (error instanceof ReportServiceError) {
    return error
  }
  if (
    error instanceof EmployeeServiceError ||
    error instanceof AttendanceServiceError ||
    error instanceof LeaveServiceError
  ) {
    if (error.httpStatus === 401) {
      return new ReportServiceError('UNAUTHORIZED', error.message, 401)
    }
    if (error.httpStatus === 403) {
      if (error.code === 'EMPLOYEE_INACTIVE') {
        return new ReportServiceError('EMPLOYEE_INACTIVE', error.message, 403)
      }
      return new ReportServiceError('UNAUTHORIZED', error.message, 403)
    }
    if (error.httpStatus === 400) {
      return new ReportServiceError('VALIDATION_ERROR', error.message, 400)
    }
    return new ReportServiceError('PERSISTENCE_ERROR', error.message, 500)
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return new ReportServiceError('PERSISTENCE_ERROR', error.message, 500)
  }
  return new ReportServiceError('PERSISTENCE_ERROR', fallbackMessage, 500)
}

function normalizeAndValidateFilters(
  input: ReportFilterInput | undefined,
): NormalizedReportFilters {
  const startDateRaw = (input?.startDate ?? '').trim()
  const endDateRaw = (input?.endDate ?? '').trim()
  const startDate = startDateRaw.length > 0 ? startDateRaw : null
  const endDate = endDateRaw.length > 0 ? endDateRaw : null

  if (startDate !== null && !isValidCalendarDate(startDate)) {
    throw new ReportServiceError(
      'VALIDATION_ERROR',
      'Start date must be a valid calendar date in YYYY-MM-DD format.',
      400,
    )
  }

  if (endDate !== null && !isValidCalendarDate(endDate)) {
    throw new ReportServiceError(
      'VALIDATION_ERROR',
      'End date must be a valid calendar date in YYYY-MM-DD format.',
      400,
    )
  }

  if (startDate !== null && endDate !== null && startDate > endDate) {
    throw new ReportServiceError(
      'VALIDATION_ERROR',
      'Start date cannot be later than end date.',
      400,
    )
  }

  const departmentRaw = (input?.department ?? 'All').trim() || 'All'
  if (
    departmentRaw !== 'All' &&
    !DEPARTMENTS.includes(departmentRaw as Department)
  ) {
    throw new ReportServiceError(
      'VALIDATION_ERROR',
      `Invalid department filter "${departmentRaw}".`,
      400,
    )
  }

  const employeeIdRaw = (input?.employeeId ?? 'All').trim()
  const employeeId = employeeIdRaw.length > 0 ? employeeIdRaw : 'All'

  const employmentStatusRaw = (input?.employmentStatus ?? 'All').trim() || 'All'
  if (
    employmentStatusRaw !== 'All' &&
    !EMPLOYMENT_STATUSES.includes(employmentStatusRaw as EmploymentStatus)
  ) {
    throw new ReportServiceError(
      'VALIDATION_ERROR',
      `Invalid employment status filter "${employmentStatusRaw}".`,
      400,
    )
  }

  const leaveStatusRaw = (input?.leaveStatus ?? 'All').trim() || 'All'
  if (
    leaveStatusRaw !== 'All' &&
    !LEAVE_REQUEST_STATUSES.includes(leaveStatusRaw as LeaveRequestStatus)
  ) {
    throw new ReportServiceError(
      'VALIDATION_ERROR',
      `Invalid leave status filter "${leaveStatusRaw}".`,
      400,
    )
  }

  return {
    startDate,
    endDate,
    department: departmentRaw as Department | 'All',
    employeeId: employeeId === 'All' ? 'All' : normalizeEmployeeId(employeeId),
    employmentStatus: employmentStatusRaw as EmploymentStatus | 'All',
    leaveStatus: leaveStatusRaw as LeaveRequestStatus | 'All',
  }
}

function enforceScopeAgainstFilters(
  scope: AuthorizedReportScope,
  actorEmployee: Employee,
  filters: NormalizedReportFilters,
  directoryByKey: ReadonlyMap<string, Employee>,
): void {
  const actorKey = normalizeEmployeeId(actorEmployee.employeeId)

  if (scope === 'own') {
    if (
      filters.department !== 'All' &&
      filters.department !== actorEmployee.department
    ) {
      throw new ReportServiceError(
        'UNAUTHORIZED',
        'You are only authorized to access reporting data for your own profile.',
        403,
      )
    }

    if (
      filters.employeeId !== 'All' &&
      normalizeEmployeeId(filters.employeeId) !== actorKey
    ) {
      throw new ReportServiceError(
        'UNAUTHORIZED',
        'You are not authorized to access reports for another employee.',
        403,
      )
    }
    return
  }

  if (scope === 'team') {
    if (
      filters.department !== 'All' &&
      filters.department !== actorEmployee.department
    ) {
      throw new ReportServiceError(
        'UNAUTHORIZED',
        `Managers can only view reports for their assigned department (${actorEmployee.department}).`,
        403,
      )
    }

    if (filters.employeeId !== 'All') {
      const target = directoryByKey.get(normalizeEmployeeId(filters.employeeId))
      if (!target || target.department !== actorEmployee.department) {
        throw new ReportServiceError(
          'UNAUTHORIZED',
          `Managers cannot view reporting data for employees outside ${actorEmployee.department}.`,
          403,
        )
      }
    }
  }
}

function cloneWorkforceReport(report: WorkforceReport): WorkforceReport {
  return {
    ...report,
    filters: { ...report.filters },
    availableDepartments: [...report.availableDepartments],
    availableEmployees: report.availableEmployees.map((item) => ({ ...item })),
    policyFlags: { ...report.policyFlags },
    employeeAnalytics: {
      ...report.employeeAnalytics,
      byDepartment: report.employeeAnalytics.byDepartment.map((item) => ({
        ...item,
      })),
      byEmploymentStatus: report.employeeAnalytics.byEmploymentStatus.map(
        (item) => ({ ...item }),
      ),
      employees: report.employeeAnalytics.employees.map((item) => ({ ...item })),
    },
    attendanceAnalytics: {
      ...report.attendanceAnalytics,
      dailyTrends: report.attendanceAnalytics.dailyTrends.map((item) => ({
        ...item,
      })),
      byDepartment: report.attendanceAnalytics.byDepartment.map((item) => ({
        ...item,
      })),
      byEmployee: report.attendanceAnalytics.byEmployee.map((item) => ({
        ...item,
      })),
      records: report.attendanceAnalytics.records.map((item) => ({ ...item })),
      leaveOverlaps: report.attendanceAnalytics.leaveOverlaps.map((item) => ({
        ...item,
      })),
    },
    leaveAnalytics: {
      ...report.leaveAnalytics,
      byLeaveType: report.leaveAnalytics.byLeaveType.map((item) => ({
        ...item,
      })),
      byDepartment: report.leaveAnalytics.byDepartment.map((item) => ({
        ...item,
      })),
      monthlyTrends: report.leaveAnalytics.monthlyTrends.map((item) => ({
        ...item,
      })),
      requests: report.leaveAnalytics.requests.map((item) => ({ ...item })),
    },
    metricDefinitions: report.metricDefinitions,
  }
}

export function createDemoReportService(
  options: DemoReportServiceOptions = {},
): ReportService {
  const empService = options.employeeService ?? defaultEmployeeService
  const attService = options.attendanceService ?? defaultAttendanceService
  const lvService = options.leaveService ?? defaultLeaveService
  const now = options.now ?? (() => new Date())
  const configuredMaxRows =
    options.maxExportRows && options.maxExportRows > 0
      ? Math.floor(options.maxExportRows)
      : DEFAULT_MAX_EXPORT_ROWS

  const reportCache = new Map<string, WorkforceReport>()
  const inFlightRequests = new Map<string, Promise<WorkforceReport>>()
  const cachingEnabled =
    options.storage !== null &&
    (options.storage !== undefined ||
      (!options.employeeService &&
        !options.attendanceService &&
        !options.leaveService))

  function resolveStorage(): StorageLike | null {
    if (options.storage !== undefined) {
      return options.storage
    }
    return getDefaultStorage()
  }

  function readStorageFingerprint(): string | null {
    if (!cachingEnabled) {
      return null
    }
    const storage = resolveStorage()
    if (!storage) {
      return null
    }
    try {
      const empRaw = storage.getItem(DEMO_EMPLOYEES_STORAGE_KEY) ?? ''
      const attRaw = storage.getItem(DEMO_ATTENDANCE_STORAGE_KEY) ?? ''
      const lvRaw = storage.getItem(DEMO_LEAVE_STORAGE_KEY) ?? ''
      return `${empRaw.length}:${empRaw}|${attRaw.length}:${attRaw}|${lvRaw.length}:${lvRaw}`
    } catch {
      return null
    }
  }

  async function resolveAuthorizedActor(
    actor: ReportActorContext | null | undefined,
  ): Promise<{
    actorEmployee: Employee
    scope: AuthorizedReportScope
    directoryByKey: Map<string, Employee>
  }> {
    const rawActorId = actor?.actorEmployeeId?.trim() ?? ''
    if (!rawActorId) {
      throw new ReportServiceError(
        'UNAUTHORIZED',
        'An authenticated session is required to access reports and analytics.',
        401,
      )
    }

    if (isSessionExpired(actor?.sessionExpiresAtUtc, now())) {
      throw new ReportServiceError(
        'UNAUTHORIZED',
        'Your session has expired. Please sign in again.',
        401,
      )
    }

    let allDirectory: Employee[]
    try {
      allDirectory = await empService.listAllDirectoryForServiceInternal()
    } catch (error) {
      throw translateDomainError(
        error,
        'Unable to verify employee directory for reporting.',
      )
    }

    const directoryByKey = new Map<string, Employee>(
      allDirectory.map((emp) => [normalizeEmployeeId(emp.employeeId), emp]),
    )
    const actorEmployee = directoryByKey.get(normalizeEmployeeId(rawActorId))

    if (!actorEmployee) {
      throw new ReportServiceError(
        'UNAUTHORIZED',
        'Current session identity does not match an active employee account.',
        401,
      )
    }

    if (actorEmployee.employmentStatus === 'Inactive') {
      throw new ReportServiceError(
        'EMPLOYEE_INACTIVE',
        'Inactive employee accounts cannot access reports or analytics.',
        403,
      )
    }

    const scope = getReportScope(actorEmployee)
    if (scope === 'none') {
      throw new ReportServiceError(
        'UNAUTHORIZED',
        'Your current role does not grant permission to view reports.',
        403,
      )
    }

    return { actorEmployee, scope, directoryByKey }
  }

  function buildCacheKey(
    actorEmployee: Employee,
    scope: AuthorizedReportScope,
    filters: NormalizedReportFilters,
    fingerprint: string,
  ): string {
    return JSON.stringify({
      actorEmployeeId: normalizeEmployeeId(actorEmployee.employeeId),
      assignedRole: actorEmployee.assignedRole,
      department: actorEmployee.department,
      employmentStatus: actorEmployee.employmentStatus,
      scope,
      canExport: canExportReports(actorEmployee),
      filters,
      fingerprint,
    })
  }

  async function computeReport(
    filters: NormalizedReportFilters,
    actor: ReportActorContext,
    actorEmployee: Employee,
    scope: AuthorizedReportScope,
    directoryByKey: ReadonlyMap<string, Employee>,
  ): Promise<WorkforceReport> {
    let scopedEmployees: Employee[]
    let scopedAttendance: Awaited<ReturnType<AttendanceService['listAttendanceRecords']>>
    let scopedLeave: Awaited<ReturnType<LeaveService['listLeaveRequests']>>

    try {
      ;[scopedEmployees, scopedAttendance, scopedLeave] = await Promise.all([
        empService.listEmployees(actor),
        attService.listAttendanceRecords(actor),
        lvService.listLeaveRequests(actor),
      ])
    } catch (error) {
      throw translateDomainError(
        error,
        'Failed to load workforce, attendance, or leave data for reporting.',
      )
    }

    const availableDepartments: Department[] =
      scope === 'all' ? [...DEPARTMENTS] : [actorEmployee.department]

    const availableEmployees: ScopedEmployeeFilterOption[] = [...scopedEmployees]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((emp) => ({
        employeeId: emp.employeeId,
        fullName: emp.fullName,
        department: emp.department,
      }))

    // 1. Employee Analytics
    const matchingEmployees = scopedEmployees.filter((emp) => {
      if (
        filters.department !== 'All' &&
        emp.department !== filters.department
      ) {
        return false
      }
      if (
        filters.employeeId !== 'All' &&
        normalizeEmployeeId(emp.employeeId) !== filters.employeeId
      ) {
        return false
      }
      if (
        filters.employmentStatus !== 'All' &&
        emp.employmentStatus !== filters.employmentStatus
      ) {
        return false
      }
      return true
    })

    const employeeRows: EmployeeReportRow[] = [...matchingEmployees]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((emp) => ({
        employeeId: emp.employeeId,
        fullName: emp.fullName,
        department: emp.department,
        position: emp.position,
        employmentStatus: emp.employmentStatus,
        hireDate: emp.hireDate,
        assignedRole: emp.assignedRole,
      }))

    const isHireInRange = (hireDate: string): boolean => {
      if (filters.startDate !== null && hireDate < filters.startDate) {
        return false
      }
      if (filters.endDate !== null && hireDate > filters.endDate) {
        return false
      }
      return true
    }

    let activeEmployees = 0
    let probationEmployees = 0
    let onLeaveStatusEmployees = 0
    let inactiveEmployees = 0
    let newHiresInPeriod = 0

    const empDeptMap = new Map<Department, DepartmentHeadcountItem>()
    const statusMap = new Map<EmploymentStatus, number>()
    for (const status of EMPLOYMENT_STATUSES) {
      statusMap.set(status, 0)
    }

    for (const emp of employeeRows) {
      const hiredInRange = isHireInRange(emp.hireDate)
      if (hiredInRange) {
        newHiresInPeriod += 1
      }

      statusMap.set(emp.employmentStatus, (statusMap.get(emp.employmentStatus) ?? 0) + 1)

      let deptEntry = empDeptMap.get(emp.department)
      if (!deptEntry) {
        deptEntry = {
          department: emp.department,
          totalCount: 0,
          activeCount: 0,
          probationCount: 0,
          onLeaveStatusCount: 0,
          inactiveCount: 0,
          newHiresCount: 0,
        }
        empDeptMap.set(emp.department, deptEntry)
      }

      deptEntry.totalCount += 1
      if (hiredInRange) {
        deptEntry.newHiresCount += 1
      }

      switch (emp.employmentStatus) {
        case 'Active':
          activeEmployees += 1
          deptEntry.activeCount += 1
          break
        case 'Probation':
          probationEmployees += 1
          deptEntry.probationCount += 1
          break
        case 'On Leave':
          onLeaveStatusEmployees += 1
          deptEntry.onLeaveStatusCount += 1
          break
        case 'Inactive':
          inactiveEmployees += 1
          deptEntry.inactiveCount += 1
          break
      }
    }

    const employeeByDepartment = Array.from(empDeptMap.values()).sort(
      (a, b) =>
        b.totalCount - a.totalCount || a.department.localeCompare(b.department),
    )

    const employeeByStatus: StatusBreakdownItem[] = EMPLOYMENT_STATUSES.map(
      (status) => ({
        status,
        count: statusMap.get(status) ?? 0,
      }),
    )

    const employeeAnalytics: EmployeeAnalyticsSummary = {
      totalEmployees: employeeRows.length,
      activeEmployees,
      probationEmployees,
      onLeaveStatusEmployees,
      inactiveEmployees,
      newHiresInPeriod,
      byDepartment: employeeByDepartment,
      byEmploymentStatus: employeeByStatus,
      employees: employeeRows,
    }

    // 2. Attendance Analytics
    const matchingAttendanceRows: AttendanceReportRow[] = []
    for (const rec of scopedAttendance) {
      const owner = directoryByKey.get(normalizeEmployeeId(rec.employeeId))
      const ownerDepartment: Department | 'Unknown' =
        owner?.department ?? 'Unknown'
      const ownerStatus = owner?.employmentStatus

      if (
        filters.department !== 'All' &&
        ownerDepartment !== filters.department
      ) {
        continue
      }
      if (
        filters.employeeId !== 'All' &&
        normalizeEmployeeId(rec.employeeId) !== filters.employeeId
      ) {
        continue
      }
      if (
        filters.employmentStatus !== 'All' &&
        ownerStatus !== filters.employmentStatus
      ) {
        continue
      }
      if (
        filters.startDate !== null &&
        rec.attendanceDate < filters.startDate
      ) {
        continue
      }
      if (filters.endDate !== null && rec.attendanceDate > filters.endDate) {
        continue
      }

      const missingClockOut =
        rec.status === 'Clocked In' && rec.clockOutAtUtc === null
      const overnight = isOvernightShift(
        rec.clockInAtUtc,
        rec.clockOutAtUtc,
        BUSINESS_TIMEZONE,
      )

      matchingAttendanceRows.push({
        id: rec.id,
        employeeId: rec.employeeId,
        employeeName: owner?.fullName ?? rec.employeeName,
        department: ownerDepartment,
        attendanceDate: rec.attendanceDate,
        clockInAtUtc: rec.clockInAtUtc,
        clockOutAtUtc: rec.clockOutAtUtc,
        durationMinutes: rec.durationMinutes,
        status: rec.status,
        isOvernight: overnight,
        missingClockOut,
      })
    }

    matchingAttendanceRows.sort(
      (a, b) => Date.parse(b.clockInAtUtc) - Date.parse(a.clockInAtUtc),
    )

    let completedSessions = 0
    let missingClockOutCount = 0
    let overnightSessionsCount = 0
    let totalRecordedMinutes = 0

    const dailyMap = new Map<string, AttendanceDailyTrendItem>()
    const attDeptMap = new Map<Department, DepartmentAttendanceItem>()
    const attEmpMap = new Map<string, EmployeeAttendanceSummaryItem>()

    for (const row of matchingAttendanceRows) {
      const isCompleted =
        row.status === 'Clocked Out' && row.durationMinutes !== null
      const recordedMins = isCompleted ? (row.durationMinutes ?? 0) : 0

      if (isCompleted) {
        completedSessions += 1
        totalRecordedMinutes += recordedMins
      }
      if (row.missingClockOut) {
        missingClockOutCount += 1
      }
      if (row.isOvernight) {
        overnightSessionsCount += 1
      }

      let dayEntry = dailyMap.get(row.attendanceDate)
      if (!dayEntry) {
        dayEntry = {
          attendanceDate: row.attendanceDate,
          sessionCount: 0,
          completedCount: 0,
          missingClockOutCount: 0,
          overnightCount: 0,
          totalRecordedMinutes: 0,
        }
        dailyMap.set(row.attendanceDate, dayEntry)
      }
      dayEntry.sessionCount += 1
      if (isCompleted) {
        dayEntry.completedCount += 1
        dayEntry.totalRecordedMinutes += recordedMins
      }
      if (row.missingClockOut) {
        dayEntry.missingClockOutCount += 1
      }
      if (row.isOvernight) {
        dayEntry.overnightCount += 1
      }

      if (row.department !== 'Unknown') {
        let deptEntry = attDeptMap.get(row.department)
        if (!deptEntry) {
          deptEntry = {
            department: row.department,
            sessionCount: 0,
            completedCount: 0,
            missingClockOutCount: 0,
            overnightCount: 0,
            totalRecordedMinutes: 0,
          }
          attDeptMap.set(row.department, deptEntry)
        }
        deptEntry.sessionCount += 1
        if (isCompleted) {
          deptEntry.completedCount += 1
          deptEntry.totalRecordedMinutes += recordedMins
        }
        if (row.missingClockOut) {
          deptEntry.missingClockOutCount += 1
        }
        if (row.isOvernight) {
          deptEntry.overnightCount += 1
        }
      }

      const empKey = normalizeEmployeeId(row.employeeId)
      let empEntry = attEmpMap.get(empKey)
      if (!empEntry) {
        empEntry = {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          department: row.department,
          sessionCount: 0,
          completedCount: 0,
          missingClockOutCount: 0,
          overnightCount: 0,
          totalRecordedMinutes: 0,
        }
        attEmpMap.set(empKey, empEntry)
      }
      empEntry.sessionCount += 1
      if (isCompleted) {
        empEntry.completedCount += 1
        empEntry.totalRecordedMinutes += recordedMins
      }
      if (row.missingClockOut) {
        empEntry.missingClockOutCount += 1
      }
      if (row.isOvernight) {
        empEntry.overnightCount += 1
      }
    }

    // Approved leave vs recorded attendance overlap audit (factual signals only)
    const approvedLeaveByEmpKey = new Map<string, typeof scopedLeave>()
    for (const req of scopedLeave) {
      if (req.status !== 'Approved') {
        continue
      }
      const key = normalizeEmployeeId(req.employeeId)
      const list = approvedLeaveByEmpKey.get(key)
      if (list) {
        list.push(req)
      } else {
        approvedLeaveByEmpKey.set(key, [req])
      }
    }

    const leaveOverlaps: AttendanceLeaveOverlapItem[] = []
    for (const attRow of matchingAttendanceRows) {
      const empApproved = approvedLeaveByEmpKey.get(
        normalizeEmployeeId(attRow.employeeId),
      )
      if (!empApproved) {
        continue
      }
      for (const req of empApproved) {
        if (
          attRow.attendanceDate >= req.startDate &&
          attRow.attendanceDate <= req.endDate
        ) {
          leaveOverlaps.push({
            employeeId: attRow.employeeId,
            employeeName: attRow.employeeName,
            department: req.department,
            attendanceDate: attRow.attendanceDate,
            attendanceRecordId: attRow.id,
            leaveRequestId: req.id,
            leaveType: req.leaveType,
            leaveStartDate: req.startDate,
            leaveEndDate: req.endDate,
          })
        }
      }
    }

    const attendanceAnalytics: AttendanceAnalyticsSummary = {
      totalSessions: matchingAttendanceRows.length,
      completedSessions,
      missingClockOutCount,
      overnightSessionsCount,
      totalRecordedMinutes,
      averageRecordedMinutes:
        completedSessions > 0
          ? Math.round(totalRecordedMinutes / completedSessions)
          : null,
      dailyTrends: Array.from(dailyMap.values()).sort((a, b) =>
        a.attendanceDate.localeCompare(b.attendanceDate),
      ),
      byDepartment: Array.from(attDeptMap.values()).sort(
        (a, b) =>
          b.sessionCount - a.sessionCount ||
          a.department.localeCompare(b.department),
      ),
      byEmployee: Array.from(attEmpMap.values()).sort(
        (a, b) =>
          b.sessionCount - a.sessionCount ||
          a.employeeName.localeCompare(b.employeeName),
      ),
      records: matchingAttendanceRows,
      leaveOverlaps,
    }

    // 3. Leave Analytics
    const effectiveFilterStart = filters.startDate ?? '0000-01-01'
    const effectiveFilterEnd = filters.endDate ?? '9999-12-31'

    const matchingLeaveRows: LeaveReportRow[] = []
    for (const req of scopedLeave) {
      const owner = directoryByKey.get(normalizeEmployeeId(req.employeeId))

      if (
        filters.department !== 'All' &&
        req.department !== filters.department
      ) {
        continue
      }
      if (
        filters.employeeId !== 'All' &&
        normalizeEmployeeId(req.employeeId) !== filters.employeeId
      ) {
        continue
      }
      if (
        filters.employmentStatus !== 'All' &&
        owner?.employmentStatus !== filters.employmentStatus
      ) {
        continue
      }
      if (filters.leaveStatus !== 'All' && req.status !== filters.leaveStatus) {
        continue
      }
      if (
        !doDateRangesOverlap(
          req.startDate,
          req.endDate,
          effectiveFilterStart,
          effectiveFilterEnd,
        )
      ) {
        continue
      }

      matchingLeaveRows.push({
        id: req.id,
        employeeId: req.employeeId,
        employeeName: owner?.fullName ?? req.employeeName,
        department: req.department,
        leaveType: req.leaveType,
        startDate: req.startDate,
        endDate: req.endDate,
        calendarDays: req.calendarDays,
        status: req.status,
        submittedAtUtc: req.submittedAtUtc,
        reviewedByRole: req.reviewedByRole,
        reviewedAtUtc: req.reviewedAtUtc,
      })
    }

    matchingLeaveRows.sort(
      (a, b) => Date.parse(b.submittedAtUtc) - Date.parse(a.submittedAtUtc),
    )

    let pendingRequests = 0
    let approvedRequests = 0
    let rejectedRequests = 0
    let cancelledRequests = 0
    let approvedCalendarDays = 0

    const typeMap = new Map<LeaveType, LeaveTypeBreakdownItem>()
    const lvDeptMap = new Map<Department, LeaveDepartmentBreakdownItem>()
    const monthMap = new Map<string, LeaveMonthlyTrendItem>()

    for (const row of matchingLeaveRows) {
      if (row.status === 'Pending') {
        pendingRequests += 1
      } else if (row.status === 'Approved') {
        approvedRequests += 1
        approvedCalendarDays += row.calendarDays
      } else if (row.status === 'Rejected') {
        rejectedRequests += 1
      } else if (row.status === 'Cancelled') {
        cancelledRequests += 1
      }

      let typeEntry = typeMap.get(row.leaveType)
      if (!typeEntry) {
        typeEntry = {
          leaveType: row.leaveType,
          totalCount: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          cancelledCount: 0,
          approvedCalendarDays: 0,
        }
        typeMap.set(row.leaveType, typeEntry)
      }
      typeEntry.totalCount += 1
      if (row.status === 'Pending') typeEntry.pendingCount += 1
      if (row.status === 'Approved') {
        typeEntry.approvedCount += 1
        typeEntry.approvedCalendarDays += row.calendarDays
      }
      if (row.status === 'Rejected') typeEntry.rejectedCount += 1
      if (row.status === 'Cancelled') typeEntry.cancelledCount += 1

      let deptEntry = lvDeptMap.get(row.department)
      if (!deptEntry) {
        deptEntry = {
          department: row.department,
          totalCount: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          cancelledCount: 0,
          approvedCalendarDays: 0,
        }
        lvDeptMap.set(row.department, deptEntry)
      }
      deptEntry.totalCount += 1
      if (row.status === 'Pending') deptEntry.pendingCount += 1
      if (row.status === 'Approved') {
        deptEntry.approvedCount += 1
        deptEntry.approvedCalendarDays += row.calendarDays
      }
      if (row.status === 'Rejected') deptEntry.rejectedCount += 1
      if (row.status === 'Cancelled') deptEntry.cancelledCount += 1

      const monthKey = row.startDate.slice(0, 7)
      let monthEntry = monthMap.get(monthKey)
      if (!monthEntry) {
        monthEntry = {
          month: monthKey,
          totalCount: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          cancelledCount: 0,
        }
        monthMap.set(monthKey, monthEntry)
      }
      monthEntry.totalCount += 1
      if (row.status === 'Pending') monthEntry.pendingCount += 1
      if (row.status === 'Approved') monthEntry.approvedCount += 1
      if (row.status === 'Rejected') monthEntry.rejectedCount += 1
      if (row.status === 'Cancelled') monthEntry.cancelledCount += 1
    }

    const leaveAnalytics: LeaveAnalyticsSummary = {
      totalRequests: matchingLeaveRows.length,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      cancelledRequests,
      approvedCalendarDays,
      byLeaveType: Array.from(typeMap.values()).sort(
        (a, b) =>
          b.totalCount - a.totalCount ||
          LEAVE_TYPES.indexOf(a.leaveType) - LEAVE_TYPES.indexOf(b.leaveType),
      ),
      byDepartment: Array.from(lvDeptMap.values()).sort(
        (a, b) =>
          b.totalCount - a.totalCount ||
          a.department.localeCompare(b.department),
      ),
      monthlyTrends: Array.from(monthMap.values()).sort((a, b) =>
        a.month.localeCompare(b.month),
      ),
      requests: matchingLeaveRows,
    }

    return {
      isDemoMode: true,
      businessTimezone: BUSINESS_TIMEZONE,
      generatedAtUtc: now().toISOString(),
      authorizedScope: scope,
      canExport: canExportReports(actorEmployee),
      filters,
      availableDepartments,
      availableEmployees,
      policyFlags: {
        attendanceAbsencePolicyConfigured: false,
        attendanceLatePolicyConfigured: false,
        recordedDurationEqualsPayableHours: false,
        leaveBalanceTrackingSupported: false,
      },
      employeeAnalytics,
      attendanceAnalytics,
      leaveAnalytics,
      metricDefinitions: REPORT_METRIC_DEFINITIONS,
    }
  }

  return {
    isDemoMode: true,
    businessTimezone: BUSINESS_TIMEZONE,
    maxExportRows: configuredMaxRows,

    invalidateCache(): void {
      reportCache.clear()
      inFlightRequests.clear()
    },

    async generateReport(
      filtersInput: ReportFilterInput | undefined,
      actor: ReportActorContext,
    ): Promise<WorkforceReport> {
      const normalizedFilters = normalizeAndValidateFilters(filtersInput)
      const { actorEmployee, scope, directoryByKey } =
        await resolveAuthorizedActor(actor)

      enforceScopeAgainstFilters(
        scope,
        actorEmployee,
        normalizedFilters,
        directoryByKey,
      )

      const fingerprint = readStorageFingerprint()
      if (fingerprint !== null) {
        const cacheKey = buildCacheKey(
          actorEmployee,
          scope,
          normalizedFilters,
          fingerprint,
        )
        const cached = reportCache.get(cacheKey)
        if (cached) {
          return cloneWorkforceReport(cached)
        }

        const existingFlight = inFlightRequests.get(cacheKey)
        if (existingFlight) {
          const result = await existingFlight
          return cloneWorkforceReport(result)
        }

        const flightPromise = computeReport(
          normalizedFilters,
          actor,
          actorEmployee,
          scope,
          directoryByKey,
        )
          .then((report) => {
            reportCache.set(cacheKey, cloneWorkforceReport(report))
            return report
          })
          .finally(() => {
            inFlightRequests.delete(cacheKey)
          })

        inFlightRequests.set(cacheKey, flightPromise)
        const computed = await flightPromise
        return cloneWorkforceReport(computed)
      }

      return computeReport(
        normalizedFilters,
        actor,
        actorEmployee,
        scope,
        directoryByKey,
      )
    },

    async exportReportCsv(
      dataset: CsvExportDataset,
      filtersInput: ReportFilterInput | undefined,
      actor: ReportActorContext,
    ): Promise<CsvExportResult> {
      if (
        dataset !== 'employees' &&
        dataset !== 'attendance' &&
        dataset !== 'leave'
      ) {
        throw new ReportServiceError(
          'VALIDATION_ERROR',
          `Unsupported export dataset "${String(dataset)}".`,
          400,
        )
      }

      const report = await this.generateReport(filtersInput, actor)

      if (!report.canExport) {
        throw new ReportServiceError(
          'UNAUTHORIZED',
          'Your current role does not grant permission to export CSV reports.',
          403,
        )
      }

      let csvContent: string
      let rowCount: number

      if (dataset === 'employees') {
        rowCount = report.employeeAnalytics.employees.length
        if (rowCount > configuredMaxRows) {
          throw new ReportServiceError(
            'EXPORT_LIMIT_EXCEEDED',
            `Employee CSV export exceeds the ${configuredMaxRows}-row safety limit (${rowCount} rows matched). Narrow your filters and try again.`,
            400,
          )
        }
        csvContent = buildEmployeeReportCsv(report.employeeAnalytics.employees)
      } else if (dataset === 'attendance') {
        rowCount = report.attendanceAnalytics.records.length
        if (rowCount > configuredMaxRows) {
          throw new ReportServiceError(
            'EXPORT_LIMIT_EXCEEDED',
            `Attendance CSV export exceeds the ${configuredMaxRows}-row safety limit (${rowCount} rows matched). Narrow your date or department filters and try again.`,
            400,
          )
        }
        csvContent = buildAttendanceReportCsv(report.attendanceAnalytics.records)
      } else {
        rowCount = report.leaveAnalytics.requests.length
        if (rowCount > configuredMaxRows) {
          throw new ReportServiceError(
            'EXPORT_LIMIT_EXCEEDED',
            `Leave CSV export exceeds the ${configuredMaxRows}-row safety limit (${rowCount} rows matched). Narrow your date or department filters and try again.`,
            400,
          )
        }
        csvContent = buildLeaveReportCsv(report.leaveAnalytics.requests)
      }

      const timestampUtc = now().toISOString()
      const businessDate = getBusinessDateString(timestampUtc, BUSINESS_TIMEZONE)

      return {
        dataset,
        filename: `smarthr-${dataset}-report-${businessDate}.csv`,
        csvContent,
        rowCount,
        generatedAtUtc: timestampUtc,
      }
    },
  }
}

export const reportService: ReportService = isBackendApiConfigured()
  ? createApiReportService()
  : createDemoReportService()
