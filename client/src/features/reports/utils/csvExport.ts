import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import type {
  AttendanceReportRow,
  EmployeeReportRow,
  LeaveReportRow,
} from '../../../types/report'
import { formatDateTimeInBusinessZone } from '../../attendance/utils/timeZone'

const FORMULA_TRIGGER_PATTERN = /^[\t\r ]*[=+\-@]|^[\t\r]/

export function sanitizeCsvCell(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  let safe = value
  if (FORMULA_TRIGGER_PATTERN.test(safe)) {
    safe = `'${safe}`
  }

  const needsQuoting = /[",\n\r]/.test(safe) || safe.startsWith("'")
  if (!needsQuoting) {
    return safe
  }

  return `"${safe.replace(/"/g, '""')}"`
}

export function buildCsvDocument(
  headers: readonly string[],
  rows: readonly (readonly (string | number | boolean | null | undefined)[])[],
): string {
  const lines = [headers.map((header) => sanitizeCsvCell(header)).join(',')]
  for (const row of rows) {
    lines.push(row.map((cell) => sanitizeCsvCell(cell)).join(','))
  }
  return lines.join('\n')
}

export function buildEmployeeReportCsv(
  employees: readonly EmployeeReportRow[],
): string {
  // Excludes unnecessary PII such as personal/work email addresses and internal record IDs
  const headers = [
    'Employee ID',
    'Full Name',
    'Department',
    'Position',
    'Employment Status',
    'Hire Date',
  ] as const

  const rows = employees.map((emp) => [
    emp.employeeId,
    emp.fullName,
    emp.department,
    emp.position,
    emp.employmentStatus,
    emp.hireDate,
  ])

  return buildCsvDocument(headers, rows)
}

export function buildAttendanceReportCsv(
  records: readonly AttendanceReportRow[],
): string {
  const headers = [
    'Employee ID',
    'Employee Name',
    'Department',
    `Attendance Date (${BUSINESS_TIMEZONE})`,
    `Clock-In (${BUSINESS_TIMEZONE})`,
    `Clock-Out (${BUSINESS_TIMEZONE})`,
    'Recorded Duration (Minutes)',
    'Status',
    'Overnight Shift',
    'Missing Clock-Out',
  ] as const

  const rows = records.map((rec) => [
    rec.employeeId,
    rec.employeeName,
    rec.department,
    rec.attendanceDate,
    formatDateTimeInBusinessZone(rec.clockInAtUtc, BUSINESS_TIMEZONE),
    rec.clockOutAtUtc
      ? formatDateTimeInBusinessZone(rec.clockOutAtUtc, BUSINESS_TIMEZONE)
      : '',
    rec.durationMinutes === null ? '' : rec.durationMinutes,
    rec.status,
    rec.isOvernight,
    rec.missingClockOut,
  ])

  return buildCsvDocument(headers, rows)
}

export function buildLeaveReportCsv(
  requests: readonly LeaveReportRow[],
): string {
  // Excludes free-text reason and reviewer notes to protect sensitive personal/medical context
  const headers = [
    'Request ID',
    'Employee ID',
    'Employee Name',
    'Department',
    'Leave Type',
    'Start Date',
    'End Date',
    'Calendar Days',
    'Status',
    `Submitted (${BUSINESS_TIMEZONE})`,
    'Reviewed By Role',
  ] as const

  const rows = requests.map((req) => [
    req.id,
    req.employeeId,
    req.employeeName,
    req.department,
    req.leaveType,
    req.startDate,
    req.endDate,
    req.calendarDays,
    req.status,
    formatDateTimeInBusinessZone(req.submittedAtUtc, BUSINESS_TIMEZONE),
    req.reviewedByRole ?? '',
  ])

  return buildCsvDocument(headers, rows)
}

export function triggerCsvDownload(filename: string, csvContent: string): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

