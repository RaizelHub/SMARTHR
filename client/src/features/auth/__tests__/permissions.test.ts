import { describe, expect, it } from 'vitest'
import { createDemoAttendanceService } from '../../attendance/services/attendanceService'
import {
  createDemoEmployeeService,
  SYNTHETIC_DEMO_EMPLOYEES,
  type StorageLike,
} from '../../employees/services/employeeService'
import { createDemoLeaveService } from '../../leave/services/leaveService'
import { createDemoAuthService, DEMO_AUTH_SESSION_KEY } from '../authService'
import {
  canAccessEmployeeRecord,
  canApproveOrRejectLeave,
  canManageEmployeeRole,
  canViewAttendanceRecord,
  canViewLeaveRecord,
  getPermissionsForRole,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isActiveActor,
  ROLE_PERMISSIONS,
} from '../permissions'

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
  }
}

const JORDAN_EMPLOYEE = SYNTHETIC_DEMO_EMPLOYEES.find(
  (e) => e.employeeId === 'EMP-1001',
)! // Engineering · Employee
const PRIYA_HR_COORD = SYNTHETIC_DEMO_EMPLOYEES.find(
  (e) => e.employeeId === 'EMP-1002',
)! // Human Resources · HR Coordinator
const MARCUS_EMPLOYEE = SYNTHETIC_DEMO_EMPLOYEES.find(
  (e) => e.employeeId === 'EMP-1003',
)! // Finance · Employee (Probation)
const DANA_MANAGER = SYNTHETIC_DEMO_EMPLOYEES.find(
  (e) => e.employeeId === 'EMP-1004',
)! // Engineering · Manager
const ALEX_HR_ADMIN = SYNTHETIC_DEMO_EMPLOYEES.find(
  (e) => e.employeeId === 'EMP-1005',
)! // Human Resources · HR Admin

describe('Centralized RBAC permission policy and service enforcement', () => {
  it('enforces default-deny and inactive-user revocation in pure permission helpers', () => {
    expect(getPermissionsForRole(null)).toEqual([])
    expect(getPermissionsForRole(undefined)).toEqual([])
    expect(hasPermission(null, 'employees.read_own')).toBe(false)
    expect(
      isActiveActor({ assignedRole: 'HR Admin', employmentStatus: 'Inactive' }),
    ).toBe(false)
    expect(
      hasPermission(
        { assignedRole: 'HR Admin', employmentStatus: 'Inactive' },
        'roles.manage',
      ),
    ).toBe(false)
    expect(
      hasAllPermissions(JORDAN_EMPLOYEE, [
        'employees.read_own',
        'attendance.record_own',
      ]),
    ).toBe(true)
    expect(
      hasAnyPermission(JORDAN_EMPLOYEE, ['employees.create', 'roles.manage']),
    ).toBe(false)
    expect(ROLE_PERMISSIONS['HR Admin']).toContain('roles.manage')
    expect(ROLE_PERMISSIONS['HR Coordinator']).not.toContain('roles.manage')
    expect(ROLE_PERMISSIONS['HR Coordinator']).not.toContain('employees.delete')
  })

  it('scopes employee, attendance, leave, and role permissions by role and department', () => {
    // Employee sees own only
    expect(canAccessEmployeeRecord(JORDAN_EMPLOYEE, JORDAN_EMPLOYEE)).toBe(true)
    expect(canAccessEmployeeRecord(JORDAN_EMPLOYEE, DANA_MANAGER)).toBe(false)
    expect(canAccessEmployeeRecord(JORDAN_EMPLOYEE, MARCUS_EMPLOYEE)).toBe(false)

    // Manager sees own department only
    expect(canAccessEmployeeRecord(DANA_MANAGER, JORDAN_EMPLOYEE)).toBe(true)
    expect(canAccessEmployeeRecord(DANA_MANAGER, DANA_MANAGER)).toBe(true)
    expect(canAccessEmployeeRecord(DANA_MANAGER, MARCUS_EMPLOYEE)).toBe(false)

    // HR Coordinator and HR Admin see all
    expect(canAccessEmployeeRecord(PRIYA_HR_COORD, MARCUS_EMPLOYEE)).toBe(true)
    expect(canAccessEmployeeRecord(ALEX_HR_ADMIN, MARCUS_EMPLOYEE)).toBe(true)

    // Attendance scoping
    expect(
      canViewAttendanceRecord(
        DANA_MANAGER,
        { employeeId: 'EMP-1001' },
        'Engineering',
      ),
    ).toBe(true)
    expect(
      canViewAttendanceRecord(
        DANA_MANAGER,
        { employeeId: 'EMP-1003' },
        'Finance',
      ),
    ).toBe(false)

    // Leave visibility & approval rules
    const engPendingLeave = {
      employeeId: 'EMP-1001',
      department: 'Engineering' as const,
      status: 'Pending' as const,
    }
    const finPendingLeave = {
      employeeId: 'EMP-1003',
      department: 'Finance' as const,
      status: 'Pending' as const,
    }
    const danaOwnLeave = {
      employeeId: 'EMP-1004',
      department: 'Engineering' as const,
      status: 'Pending' as const,
    }

    expect(canViewLeaveRecord(DANA_MANAGER, engPendingLeave)).toBe(true)
    expect(canViewLeaveRecord(DANA_MANAGER, finPendingLeave)).toBe(false)
    expect(canApproveOrRejectLeave(DANA_MANAGER, engPendingLeave).allowed).toBe(
      true,
    )
    expect(canApproveOrRejectLeave(DANA_MANAGER, finPendingLeave).allowed).toBe(
      false,
    )
    expect(canApproveOrRejectLeave(DANA_MANAGER, danaOwnLeave).allowed).toBe(
      false,
    )
    expect(canApproveOrRejectLeave(JORDAN_EMPLOYEE, engPendingLeave).allowed).toBe(
      false,
    )

    expect(canManageEmployeeRole(ALEX_HR_ADMIN)).toBe(true)
    expect(canManageEmployeeRole(PRIYA_HR_COORD)).toBe(false)
    expect(canManageEmployeeRole(DANA_MANAGER)).toBe(false)
    expect(canManageEmployeeRole(JORDAN_EMPLOYEE)).toBe(false)
  })

  it('rejects inactive login, detects session expiration, and refreshes revoked roles dynamically', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)
    let currentTime = new Date('2026-11-12T08:00:00.000Z')

    const authService = createDemoAuthService({
      employeeService: empService,
      storage,
      now: () => currentTime,
      defaultTtlMs: 60 * 60 * 1000, // 1 hour
    })

    // Create inactive employee and reject sign-in
    await empService.createEmployee(
      {
        employeeId: 'EMP-2099',
        fullName: 'Deactivated User',
        workEmail: 'deactivated@smarthr.demo',
        department: 'Sales',
        position: 'Representative',
        employmentStatus: 'Inactive',
        hireDate: '2025-01-10',
        assignedRole: 'Employee',
      },
      { actorEmployeeId: 'EMP-1002' },
    )

    await expect(authService.signIn('EMP-2099')).rejects.toMatchObject({
      code: 'EMPLOYEE_INACTIVE',
    })

    // Sign in as Jordan Taylor (EMP-1001)
    const signInResult = await authService.signIn('EMP-1001')
    expect(signInResult.user.assignedRole).toBe('Employee')
    const rawSession = storage.getItem(DEMO_AUTH_SESSION_KEY)
    expect(rawSession).not.toBeNull()
    expect(rawSession).not.toContain('assignedRole') // Do not store authoritative role inside session token

    // Promote EMP-1001 while signed in -> getSessionState resolves fresh role immediately
    await empService.updateEmployeeRole(
      { targetEmployeeId: 'EMP-1001', newRole: 'Manager' },
      { actorEmployeeId: 'EMP-1005' },
    )
    const refreshed = await authService.getSessionState()
    expect(refreshed.status).toBe('authenticated')
    expect(refreshed.user?.assignedRole).toBe('Manager')

    // Advance past expiration -> getSessionState reports expired & clears storage
    currentTime = new Date('2026-11-12T09:05:00.000Z')
    const expiredState = await authService.getSessionState()
    expect(expiredState.status).toBe('expired')
    expect(expiredState.user).toBeNull()
    expect(storage.getItem(DEMO_AUTH_SESSION_KEY)).toBeNull()
  })

  it('blocks unauthorized service actions (401/403), prevents HR Admin escalation, protects last admin, and writes audit logs', async () => {
    const storage = createMemoryStorage()
    const currentTime = new Date('2026-11-12T08:00:00.000Z')
    const expiredTimestamp = '2026-11-12T07:59:00.000Z'

    const empService = createDemoEmployeeService(storage, () => currentTime)
    const attService = createDemoAttendanceService({
      employeeService: empService,
      storage,
      now: () => currentTime,
    })
    const lvService = createDemoLeaveService({
      employeeService: empService,
      storage,
      now: () => currentTime,
    })

    // Unauthenticated & expired requests rejected with HTTP 401
    await expect(
      empService.listEmployees({ actorEmployeeId: null }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 401 })

    await expect(
      empService.listEmployees({
        actorEmployeeId: 'EMP-1005',
        sessionExpiresAtUtc: expiredTimestamp,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 401 })

    await expect(
      attService.clockIn(
        { employeeId: 'EMP-1001' },
        {
          actorEmployeeId: 'EMP-1001',
          sessionExpiresAtUtc: expiredTimestamp,
        },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 401 })

    await expect(
      lvService.listLeaveRequests({
        actorEmployeeId: 'EMP-1001',
        sessionExpiresAtUtc: expiredTimestamp,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 401 })

    // Employee scoped to self in employee directory; Manager scoped to Engineering
    const empView = await empService.listEmployees({
      actorEmployeeId: 'EMP-1001',
    })
    expect(empView.map((e) => e.employeeId)).toEqual(['EMP-1001'])

    const mgrView = await empService.listEmployees({
      actorEmployeeId: 'EMP-1004',
    })
    expect(mgrView.map((e) => e.employeeId).sort()).toEqual([
      'EMP-1001',
      'EMP-1004',
    ])

    // Employee cannot create employees or assign roles or wipe records
    await expect(
      empService.createEmployee(
        {
          employeeId: 'EMP-4001',
          fullName: 'Unauthorized Newcomer',
          workEmail: 'unauth@smarthr.demo',
          department: 'Sales',
          position: 'Associate',
          employmentStatus: 'Active',
          hireDate: '2026-10-01',
          assignedRole: 'Employee',
        },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    await expect(
      empService.updateEmployeeRole(
        { targetEmployeeId: 'EMP-1001', newRole: 'HR Admin' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    // HR Coordinator cannot register an HR Admin or change roles or delete records
    await expect(
      empService.createEmployee(
        {
          employeeId: 'EMP-4002',
          fullName: 'Rogue Admin',
          workEmail: 'rogue@smarthr.demo',
          department: 'Human Resources',
          position: 'Admin',
          employmentStatus: 'Active',
          hireDate: '2026-10-01',
          assignedRole: 'HR Admin',
        },
        { actorEmployeeId: 'EMP-1002' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    await expect(
      empService.updateEmployeeRole(
        { targetEmployeeId: 'EMP-1003', newRole: 'HR Admin' },
        { actorEmployeeId: 'EMP-1002' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    await expect(
      empService.clearEmployees({ actorEmployeeId: 'EMP-1002' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    await expect(
      attService.clearAttendanceRecords({ actorEmployeeId: 'EMP-1002' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    await expect(
      lvService.clearLeaveRequests({ actorEmployeeId: 'EMP-1002' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    // Manager attendance scoping: sees Engineering (EMP-1001), NOT Finance (EMP-1003)
    await attService.clockIn(
      { employeeId: 'EMP-1001' },
      { actorEmployeeId: 'EMP-1001' },
    )
    await attService.clockIn(
      { employeeId: 'EMP-1003' },
      { actorEmployeeId: 'EMP-1003' },
    )
    const mgrAttendance = await attService.listAttendanceRecords({
      actorEmployeeId: 'EMP-1004',
    })
    expect(mgrAttendance.map((r) => r.employeeId)).toEqual(['EMP-1001'])

    // Last active HR Admin cannot be demoted
    await expect(
      empService.updateEmployeeRole(
        { targetEmployeeId: 'EMP-1005', newRole: 'Employee' },
        { actorEmployeeId: 'EMP-1005' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 })

    // Security audit log recorded denied attempts and blocks non-admin inspection
    await expect(
      empService.listSecurityAuditEvents({ actorEmployeeId: 'EMP-1002' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    const auditEvents = await empService.listSecurityAuditEvents({
      actorEmployeeId: 'EMP-1005',
    })
    expect(
      auditEvents.filter((e) => e.eventType === 'ROLE_CHANGE_DENIED'),
    ).toHaveLength(2)

    // HR Admin can promote and audit log captures ROLE_CHANGED
    await empService.updateEmployeeRole(
      { targetEmployeeId: 'EMP-1002', newRole: 'HR Admin' },
      { actorEmployeeId: 'EMP-1005' },
    )
    const updatedAudit = await empService.listSecurityAuditEvents({
      actorEmployeeId: 'EMP-1005',
    })
    expect(updatedAudit[0]?.eventType).toBe('ROLE_CHANGED')
    expect(updatedAudit[0]?.targetEmployeeId).toBe('EMP-1002')
  })
})

