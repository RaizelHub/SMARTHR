import type { AttendanceRecord } from '../../types/attendance'
import type { AssignedRole, Department, Employee } from '../../types/employee'
import type { LeaveRequest } from '../../types/leave'
import { normalizeEmployeeId } from '../employees/validation/employeeSchema'

export const PERMISSIONS = [
  'employees.read_own',
  'employees.read_team',
  'employees.read_all',
  'employees.create',
  'employees.update',
  'employees.delete',
  'attendance.record_own',
  'attendance.read_own',
  'attendance.read_team',
  'attendance.read_all',
  'leave.request',
  'leave.read_own',
  'leave.read_team',
  'leave.read_all',
  'leave.approve',
  'leave.reject',
  'reports.view_own',
  'reports.view_team',
  'reports.view_all',
  'reports.export',
  'payroll.view_own',
  'payroll.view',
  'payroll.create',
  'payroll.calculate',
  'payroll.review',
  'payroll.approve',
  'payroll.lock',
  'payroll.export',
  'compensation.manage',
  'roles.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export type ReportScope = 'none' | 'own' | 'team' | 'all'

export const ROLE_PERMISSIONS: Readonly<
  Record<AssignedRole, readonly Permission[]>
> = {
  Employee: [
    'employees.read_own',
    'attendance.record_own',
    'attendance.read_own',
    'leave.request',
    'leave.read_own',
    'reports.view_own',
    'payroll.view_own',
  ],
  Manager: [
    'employees.read_own',
    'employees.read_team',
    'attendance.record_own',
    'attendance.read_own',
    'attendance.read_team',
    'leave.request',
    'leave.read_own',
    'leave.read_team',
    'leave.approve',
    'leave.reject',
    'reports.view_own',
    'reports.view_team',
    'reports.export',
    'payroll.view_own',
  ],
  'HR Coordinator': [
    'employees.read_own',
    'employees.read_all',
    'employees.create',
    'employees.update',
    'attendance.record_own',
    'attendance.read_own',
    'attendance.read_all',
    'leave.request',
    'leave.read_own',
    'leave.read_all',
    'leave.approve',
    'leave.reject',
    'reports.view_own',
    'reports.view_all',
    'reports.export',
    'payroll.view_own',
    'payroll.view',
    'payroll.create',
    'payroll.calculate',
    'payroll.review',
    'payroll.export',
    'compensation.manage',
  ],
  'HR Admin': [
    'employees.read_own',
    'employees.read_all',
    'employees.create',
    'employees.update',
    'employees.delete',
    'attendance.record_own',
    'attendance.read_own',
    'attendance.read_all',
    'leave.request',
    'leave.read_own',
    'leave.read_all',
    'leave.approve',
    'leave.reject',
    'reports.view_own',
    'reports.view_all',
    'reports.export',
    'payroll.view_own',
    'payroll.view',
    'payroll.create',
    'payroll.calculate',
    'payroll.review',
    'payroll.approve',
    'payroll.lock',
    'payroll.export',
    'compensation.manage',
    'roles.manage',
  ],
} as const

export function getPermissionsForRole(
  role: AssignedRole | null | undefined,
): readonly Permission[] {
  if (!role || !(role in ROLE_PERMISSIONS)) {
    return []
  }
  return ROLE_PERMISSIONS[role]
}

export function isActiveActor(
  actor: Pick<Employee, 'employmentStatus' | 'assignedRole'> | null | undefined,
): actor is Pick<Employee, 'employmentStatus' | 'assignedRole'> {
  return Boolean(actor && actor.employmentStatus !== 'Inactive')
}

export function hasPermission(
  actor: Pick<Employee, 'employmentStatus' | 'assignedRole'> | null | undefined,
  permission: Permission,
): boolean {
  if (!isActiveActor(actor)) {
    return false
  }
  return getPermissionsForRole(actor.assignedRole).includes(permission)
}

export function hasAnyPermission(
  actor: Pick<Employee, 'employmentStatus' | 'assignedRole'> | null | undefined,
  permissions: readonly Permission[],
): boolean {
  if (permissions.length === 0) {
    return isActiveActor(actor)
  }
  return permissions.some((permission) => hasPermission(actor, permission))
}

export function hasAllPermissions(
  actor: Pick<Employee, 'employmentStatus' | 'assignedRole'> | null | undefined,
  permissions: readonly Permission[],
): boolean {
  if (!isActiveActor(actor)) {
    return false
  }
  return permissions.every((permission) => hasPermission(actor, permission))
}

export function canAccessEmployeeRecord(
  actor:
    | Pick<Employee, 'employeeId' | 'department' | 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
  target: Pick<Employee, 'employeeId' | 'department'>,
): boolean {
  if (!isActiveActor(actor)) {
    return false
  }
  if (hasPermission(actor, 'employees.read_all')) {
    return true
  }
  if (
    hasPermission(actor, 'employees.read_team') &&
    actor.department === target.department
  ) {
    return true
  }
  if (
    hasPermission(actor, 'employees.read_own') &&
    normalizeEmployeeId(actor.employeeId) ===
      normalizeEmployeeId(target.employeeId)
  ) {
    return true
  }
  return false
}

export function canViewAttendanceRecord(
  actor:
    | Pick<Employee, 'employeeId' | 'department' | 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
  record: Pick<AttendanceRecord, 'employeeId'>,
  recordEmployeeDepartment?: Department,
): boolean {
  if (!isActiveActor(actor)) {
    return false
  }
  if (hasPermission(actor, 'attendance.read_all')) {
    return true
  }
  if (
    hasPermission(actor, 'attendance.read_team') &&
    (normalizeEmployeeId(actor.employeeId) ===
      normalizeEmployeeId(record.employeeId) ||
      (recordEmployeeDepartment !== undefined &&
        actor.department === recordEmployeeDepartment))
  ) {
    return true
  }
  if (
    hasPermission(actor, 'attendance.read_own') &&
    normalizeEmployeeId(actor.employeeId) ===
      normalizeEmployeeId(record.employeeId)
  ) {
    return true
  }
  return false
}

export function canViewLeaveRecord(
  actor:
    | Pick<Employee, 'employeeId' | 'department' | 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
  request: Pick<LeaveRequest, 'employeeId' | 'department'>,
): boolean {
  if (!isActiveActor(actor)) {
    return false
  }
  if (hasPermission(actor, 'leave.read_all')) {
    return true
  }
  if (
    hasPermission(actor, 'leave.read_team') &&
    (normalizeEmployeeId(actor.employeeId) ===
      normalizeEmployeeId(request.employeeId) ||
      actor.department === request.department)
  ) {
    return true
  }
  if (
    hasPermission(actor, 'leave.read_own') &&
    normalizeEmployeeId(actor.employeeId) ===
      normalizeEmployeeId(request.employeeId)
  ) {
    return true
  }
  return false
}

export function canApproveOrRejectLeave(
  actor:
    | Pick<Employee, 'employeeId' | 'department' | 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
  request: Pick<LeaveRequest, 'employeeId' | 'department' | 'status'>,
): { allowed: boolean; reason?: string } {
  if (!isActiveActor(actor)) {
    return {
      allowed: false,
      reason: 'An active authenticated session is required.',
    }
  }

  if (
    !hasPermission(actor, 'leave.approve') ||
    !hasPermission(actor, 'leave.reject')
  ) {
    return {
      allowed: false,
      reason: 'Only Managers or HR personnel can review leave requests.',
    }
  }

  if (
    normalizeEmployeeId(actor.employeeId) ===
    normalizeEmployeeId(request.employeeId)
  ) {
    return {
      allowed: false,
      reason: 'Reviewers cannot approve or reject their own leave requests.',
    }
  }

  if (
    !hasPermission(actor, 'leave.read_all') &&
    actor.department !== request.department
  ) {
    return {
      allowed: false,
      reason: 'Managers can only review leave requests within their department.',
    }
  }

  if (request.status !== 'Pending') {
    return {
      allowed: false,
      reason: `Request is ${request.status} and cannot be modified.`,
    }
  }

  return { allowed: true }
}

export function canManageEmployeeRole(
  actor:
    | Pick<Employee, 'employeeId' | 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
): boolean {
  return hasPermission(actor, 'roles.manage')
}

export function getReportScope(
  actor:
    | Pick<Employee, 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
): ReportScope {
  if (!isActiveActor(actor)) {
    return 'none'
  }
  if (hasPermission(actor, 'reports.view_all')) {
    return 'all'
  }
  if (hasPermission(actor, 'reports.view_team')) {
    return 'team'
  }
  if (hasPermission(actor, 'reports.view_own')) {
    return 'own'
  }
  return 'none'
}

export function canViewReport(
  actor:
    | Pick<Employee, 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
): boolean {
  return getReportScope(actor) !== 'none'
}

export function canExportReports(
  actor:
    | Pick<Employee, 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
): boolean {
  return hasPermission(actor, 'reports.export')
}

export function canAccessPayrollManagement(
  actor:
    | Pick<Employee, 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
): boolean {
  return hasPermission(actor, 'payroll.view')
}

export function canManageCompensation(
  actor:
    | Pick<Employee, 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
): boolean {
  return hasPermission(actor, 'compensation.manage')
}

export function canViewPayrollEntry(
  actor:
    | Pick<Employee, 'employeeId' | 'employmentStatus' | 'assignedRole'>
    | null
    | undefined,
  targetEmployeeId: string,
): boolean {
  if (!isActiveActor(actor)) {
    return false
  }
  if (hasPermission(actor, 'payroll.view')) {
    return true
  }
  if (
    hasPermission(actor, 'payroll.view_own') &&
    normalizeEmployeeId(actor.employeeId) ===
      normalizeEmployeeId(targetEmployeeId)
  ) {
    return true
  }
  return false
}
