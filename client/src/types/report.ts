import type { AttendanceStatus } from './attendance'
import type {
  AssignedRole,
  Department,
  EmploymentStatus,
} from './employee'
import type { LeaveRequestStatus, LeaveType } from './leave'

export interface ReportActorContext {
  actorEmployeeId: string | null | undefined
  sessionExpiresAtUtc?: string | null
}

export interface ReportFilterInput {
  startDate?: string
  endDate?: string
  department?: Department | 'All'
  employeeId?: string | 'All'
  employmentStatus?: EmploymentStatus | 'All'
  leaveStatus?: LeaveRequestStatus | 'All'
}

export interface NormalizedReportFilters {
  startDate: string | null
  endDate: string | null
  department: Department | 'All'
  employeeId: string | 'All'
  employmentStatus: EmploymentStatus | 'All'
  leaveStatus: LeaveRequestStatus | 'All'
}

export type AuthorizedReportScope = 'own' | 'team' | 'all'

export interface ScopedEmployeeFilterOption {
  employeeId: string
  fullName: string
  department: Department
}

export interface EmployeeReportRow {
  employeeId: string
  fullName: string
  department: Department
  position: string
  employmentStatus: EmploymentStatus
  hireDate: string
  assignedRole: AssignedRole
}

export interface DepartmentHeadcountItem {
  department: Department
  totalCount: number
  activeCount: number
  probationCount: number
  onLeaveStatusCount: number
  inactiveCount: number
  newHiresCount: number
}

export interface StatusBreakdownItem {
  status: EmploymentStatus
  count: number
}

export interface EmployeeAnalyticsSummary {
  totalEmployees: number
  activeEmployees: number
  probationEmployees: number
  onLeaveStatusEmployees: number
  inactiveEmployees: number
  newHiresInPeriod: number
  byDepartment: DepartmentHeadcountItem[]
  byEmploymentStatus: StatusBreakdownItem[]
  employees: EmployeeReportRow[]
}

export interface AttendanceDailyTrendItem {
  attendanceDate: string
  sessionCount: number
  completedCount: number
  missingClockOutCount: number
  overnightCount: number
  totalRecordedMinutes: number
}

export interface DepartmentAttendanceItem {
  department: Department
  sessionCount: number
  completedCount: number
  missingClockOutCount: number
  overnightCount: number
  totalRecordedMinutes: number
}

export interface EmployeeAttendanceSummaryItem {
  employeeId: string
  employeeName: string
  department: Department | 'Unknown'
  sessionCount: number
  completedCount: number
  missingClockOutCount: number
  overnightCount: number
  totalRecordedMinutes: number
}

export interface AttendanceReportRow {
  id: string
  employeeId: string
  employeeName: string
  department: Department | 'Unknown'
  attendanceDate: string
  clockInAtUtc: string
  clockOutAtUtc: string | null
  durationMinutes: number | null
  status: AttendanceStatus
  isOvernight: boolean
  missingClockOut: boolean
}

export interface AttendanceLeaveOverlapItem {
  employeeId: string
  employeeName: string
  department: Department
  attendanceDate: string
  attendanceRecordId: string
  leaveRequestId: string
  leaveType: LeaveType
  leaveStartDate: string
  leaveEndDate: string
}

export interface AttendanceAnalyticsSummary {
  totalSessions: number
  completedSessions: number
  missingClockOutCount: number
  overnightSessionsCount: number
  totalRecordedMinutes: number
  averageRecordedMinutes: number | null
  dailyTrends: AttendanceDailyTrendItem[]
  byDepartment: DepartmentAttendanceItem[]
  byEmployee: EmployeeAttendanceSummaryItem[]
  records: AttendanceReportRow[]
  leaveOverlaps: AttendanceLeaveOverlapItem[]
}

export interface LeaveTypeBreakdownItem {
  leaveType: LeaveType
  totalCount: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  cancelledCount: number
  approvedCalendarDays: number
}

export interface LeaveDepartmentBreakdownItem {
  department: Department
  totalCount: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  cancelledCount: number
  approvedCalendarDays: number
}

export interface LeaveMonthlyTrendItem {
  month: string // YYYY-MM based on request startDate
  totalCount: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  cancelledCount: number
}

export interface LeaveReportRow {
  id: string
  employeeId: string
  employeeName: string
  department: Department
  leaveType: LeaveType
  startDate: string
  endDate: string
  calendarDays: number
  status: LeaveRequestStatus
  submittedAtUtc: string
  reviewedByRole: AssignedRole | null
  reviewedAtUtc: string | null
}

export interface LeaveAnalyticsSummary {
  totalRequests: number
  pendingRequests: number
  approvedRequests: number
  rejectedRequests: number
  cancelledRequests: number
  approvedCalendarDays: number
  byLeaveType: LeaveTypeBreakdownItem[]
  byDepartment: LeaveDepartmentBreakdownItem[]
  monthlyTrends: LeaveMonthlyTrendItem[]
  requests: LeaveReportRow[]
}

export interface ReportMetricDefinition {
  metric: string
  definition: string
}

export interface WorkforceReport {
  isDemoMode: boolean
  businessTimezone: string
  generatedAtUtc: string
  authorizedScope: AuthorizedReportScope
  canExport: boolean
  filters: NormalizedReportFilters
  availableDepartments: Department[]
  availableEmployees: ScopedEmployeeFilterOption[]
  policyFlags: {
    attendanceAbsencePolicyConfigured: boolean
    attendanceLatePolicyConfigured: boolean
    recordedDurationEqualsPayableHours: boolean
    leaveBalanceTrackingSupported: boolean
  }
  employeeAnalytics: EmployeeAnalyticsSummary
  attendanceAnalytics: AttendanceAnalyticsSummary
  leaveAnalytics: LeaveAnalyticsSummary
  metricDefinitions: readonly ReportMetricDefinition[]
}

export type CsvExportDataset = 'employees' | 'attendance' | 'leave'

export interface CsvExportResult {
  dataset: CsvExportDataset
  filename: string
  csvContent: string
  rowCount: number
  generatedAtUtc: string
}

