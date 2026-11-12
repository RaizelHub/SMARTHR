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
  'roles.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Readonly<
  Record<AssignedRole, readonly Permission[]>
> = {
  Employee: [
    'employees.read_own',
    'attendance.record_own',
    'attendance.read_own',
    'leave.request',
    'leave.read_own',
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

