import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttendanceRecord } from '../../../types/attendance'
import type { Employee } from '../../../types/employee'
import type { LeaveRequest } from '../../../types/leave'
import {
  createDemoAttendanceService,
  DEMO_ATTENDANCE_STORAGE_KEY,
} from '../../attendance/services/attendanceService'
import {
  createDemoEmployeeService,
  DEMO_EMPLOYEES_STORAGE_KEY,
} from '../../employees/services/employeeService'
import {
  createDemoLeaveService,
  DEMO_LEAVE_STORAGE_KEY,
} from '../../leave/services/leaveService'
import {
  createDemoReportService,
  ReportServiceError,
} from '../services/reportService'
import { sanitizeCsvCell } from '../utils/csvExport'

describe('CSV sanitization and formula-injection protection', () => {
  it('neutralizes formula triggers while preserving safe RFC 4180 quoting', () => {
    expect(sanitizeCsvCell('=CMD("calc")')).toBe(`"'=CMD(""calc"")"`)
    expect(sanitizeCsvCell('+1+1')).toBe(`"'+1+1"`)
    expect(sanitizeCsvCell('-2*3')).toBe(`"'-2*3"`)
    expect(sanitizeCsvCell('@SUM(A1:A2)')).toBe(`"'@SUM(A1:A2)"`)
    expect(sanitizeCsvCell('\t=IMPORTXML()')).toBe(`"'\t=IMPORTXML()"`)
    expect(sanitizeCsvCell('  =1+1')).toBe(`"'  =1+1"`)
    expect(sanitizeCsvCell('Engineering, Core')).toBe(`"Engineering, Core"`)
    expect(sanitizeCsvCell('Jordan "JT" Taylor')).toBe(`"Jordan ""JT"" Taylor"`)
    expect(sanitizeCsvCell('Jordan Taylor')).toBe('Jordan Taylor')
    expect(sanitizeCsvCell(42)).toBe('42')
    expect(sanitizeCsvCell(null)).toBe('')
  })
})

describe('reportService aggregations, filters, RBAC, exports, caching, and scale', () => {
  const fixedNow = () => new Date('2026-11-15T06:00:00.000Z')

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('computes accurate employee, attendance, overnight, leave status, and overlap metrics', async () => {
    const empSvc = createDemoEmployeeService(window.localStorage, fixedNow)
    const attSvc = createDemoAttendanceService({
      employeeService: empSvc,
      storage: window.localStorage,
      now: fixedNow,
    })
    const lvSvc = createDemoLeaveService({
      employeeService: empSvc,
      storage: window.localStorage,
      now: fixedNow,
    })
    const rptSvc = createDemoReportService({
      employeeService: empSvc,
      attendanceService: attSvc,
      leaveService: lvSvc,
      storage: window.localStorage,
      now: fixedNow,
    })

    // Seed synthetic directory first, then add 1 extra employee in 2026-11
    await empSvc.listDemoSignInProfiles()
    await empSvc.createEmployee(
      {
        employeeId: 'EMP-1006',
        fullName: '=HYPERLINK("http://evil", "Nina")',
        workEmail: 'nina.santos@smarthr.demo',
        department: 'Sales',
        position: 'Account Executive',
        employmentStatus: 'On Leave',
        hireDate: '2026-11-02',
        assignedRole: 'Employee',
      },
      { actorEmployeeId: 'EMP-1005' },
    )

    // Seed attendance records in Asia/Manila:
    // 1. EMP-1001 overnight shift starting 2026-11-10 22:00 PHT (14:00Z) -> ending 2026-11-11 06:00 PHT (22:00Z) => attendanceDate 2026-11-10
    // 2. EMP-1001 open session on 2026-11-12 (missing clock-out)
    // 3. EMP-1003 completed session on 2026-11-12 (same day as Approved leave for overlap test!)
    const seededAttendance: AttendanceRecord[] = [
      {
        id: 'att-overnight-1',
        employeeId: 'EMP-1001',
        employeeName: 'Jordan Taylor',
        attendanceDate: '2026-11-10',
        clockInAtUtc: '2026-11-10T14:00:00.000Z',
        clockOutAtUtc: '2026-11-10T22:00:00.000Z',
        durationMinutes: 480,
        status: 'Clocked Out',
        businessTimezone: 'Asia/Manila',
        createdAtUtc: '2026-11-10T14:00:00.000Z',
        updatedAtUtc: '2026-11-10T22:00:00.000Z',
      },
      {
        id: 'att-open-1',
        employeeId: 'EMP-1001',
        employeeName: 'Jordan Taylor',
        attendanceDate: '2026-11-12',
        clockInAtUtc: '2026-11-12T01:00:00.000Z',
        clockOutAtUtc: null,
        durationMinutes: null,
        status: 'Clocked In',
        businessTimezone: 'Asia/Manila',
        createdAtUtc: '2026-11-12T01:00:00.000Z',
        updatedAtUtc: '2026-11-12T01:00:00.000Z',
      },
      {
        id: 'att-overlap-1',
        employeeId: 'EMP-1003',
        employeeName: 'Marcus Chen',
        attendanceDate: '2026-11-12',
        clockInAtUtc: '2026-11-12T00:30:00.000Z',
        clockOutAtUtc: '2026-11-12T04:30:00.000Z',
        durationMinutes: 240,
        status: 'Clocked Out',
        businessTimezone: 'Asia/Manila',
        createdAtUtc: '2026-11-12T00:30:00.000Z',
        updatedAtUtc: '2026-11-12T04:30:00.000Z',
      },
    ]
    window.localStorage.setItem(
      DEMO_ATTENDANCE_STORAGE_KEY,
      JSON.stringify(seededAttendance),
    )

    // Seed leave records covering Pending, Approved, Rejected, Cancelled cleanly
    const seededLeave: LeaveRequest[] = [
      {
        id: 'lv-approved-1',
        employeeId: 'EMP-1003',
        employeeName: 'Marcus Chen',
        department: 'Finance',
        leaveType: 'Annual Leave',
        startDate: '2026-11-11',
        endDate: '2026-11-13',
        calendarDays: 3,
        reason: 'Private medical appointment @clinic',
        status: 'Approved',
        businessTimezone: 'Asia/Manila',
        submittedAtUtc: '2026-11-05T02:00:00.000Z',
        reviewedByEmployeeId: 'EMP-1002',
        reviewedByName: 'Priya Nair',
        reviewedByRole: 'HR Coordinator',
        reviewedAtUtc: '2026-11-05T05:00:00.000Z',
        reviewerNote: 'Verified coverage',
        cancelledAtUtc: null,
        decisionHistory: [],
        updatedAtUtc: '2026-11-05T05:00:00.000Z',
      },
      {
        id: 'lv-cancelled-1',
        employeeId: 'EMP-1001',
        employeeName: 'Jordan Taylor',
        department: 'Engineering',
        leaveType: 'Sick Leave',
        startDate: '2026-11-29',
        endDate: '2026-12-01',
        calendarDays: 3,
        reason: 'Cancelled trip',
        status: 'Cancelled',
        businessTimezone: 'Asia/Manila',
        submittedAtUtc: '2026-11-06T02:00:00.000Z',
        reviewedByEmployeeId: null,
        reviewedByName: null,
        reviewedByRole: null,
        reviewedAtUtc: null,
        reviewerNote: null,
        cancelledAtUtc: '2026-11-07T02:00:00.000Z',
        decisionHistory: [],
        updatedAtUtc: '2026-11-07T02:00:00.000Z',
      },
      {
        id: 'lv-rejected-1',
        employeeId: 'EMP-1004',
        employeeName: 'Dana Reyes',
        department: 'Engineering',
        leaveType: 'Emergency Leave',
        startDate: '2026-11-20',
        endDate: '2026-11-21',
        calendarDays: 2,
        reason: 'Denied overlap',
        status: 'Rejected',
        businessTimezone: 'Asia/Manila',
        submittedAtUtc: '2026-11-08T02:00:00.000Z',
        reviewedByEmployeeId: 'EMP-1005',
        reviewedByName: 'Alex Rivera',
        reviewedByRole: 'HR Admin',
        reviewedAtUtc: '2026-11-08T05:00:00.000Z',
        reviewerNote: 'Peak release week',
        cancelledAtUtc: null,
        decisionHistory: [],
        updatedAtUtc: '2026-11-08T05:00:00.000Z',
      },
      {
        id: 'lv-pending-1',
        employeeId: 'EMP-1006',
        employeeName: '=HYPERLINK("http://evil", "Nina")',
        department: 'Sales',
        leaveType: 'Unpaid Leave',
        startDate: '2026-12-05',
        endDate: '2026-12-06',
        calendarDays: 2,
        reason: 'Extended personal trip',
        status: 'Pending',
        businessTimezone: 'Asia/Manila',
        submittedAtUtc: '2026-11-10T02:00:00.000Z',
        reviewedByEmployeeId: null,
        reviewedByName: null,
        reviewedByRole: null,
        reviewedAtUtc: null,
        reviewerNote: null,
        cancelledAtUtc: null,
        decisionHistory: [],
        updatedAtUtc: '2026-11-10T02:00:00.000Z',
      },
    ]
    window.localStorage.setItem(
      DEMO_LEAVE_STORAGE_KEY,
      JSON.stringify(seededLeave),
    )

    const report = await rptSvc.generateReport(
      { startDate: '2026-11-01', endDate: '2026-11-30' },
      { actorEmployeeId: 'EMP-1005' },
    )

    expect(report.authorizedScope).toBe('all')
    expect(report.canExport).toBe(true)
    expect(report.policyFlags).toEqual({
      attendanceAbsencePolicyConfigured: false,
      attendanceLatePolicyConfigured: false,
      recordedDurationEqualsPayableHours: false,
      leaveBalanceTrackingSupported: false,
    })

    // Employee counts & new hires in November 2026 (only EMP-1006 hired in Nov 2026)
    expect(report.employeeAnalytics.totalEmployees).toBe(6)
    expect(report.employeeAnalytics.activeEmployees).toBe(4)
    expect(report.employeeAnalytics.probationEmployees).toBe(1)
    expect(report.employeeAnalytics.onLeaveStatusEmployees).toBe(1)
    expect(report.employeeAnalytics.inactiveEmployees).toBe(0)
    expect(report.employeeAnalytics.newHiresInPeriod).toBe(1)

    // Attendance metrics: all 3 Nov shifts included
    expect(report.attendanceAnalytics.totalSessions).toBe(3)
    expect(report.attendanceAnalytics.completedSessions).toBe(2)
    expect(report.attendanceAnalytics.missingClockOutCount).toBe(1)
    expect(report.attendanceAnalytics.overnightSessionsCount).toBe(1)
    expect(report.attendanceAnalytics.totalRecordedMinutes).toBe(720) // 480 + 240
    expect(report.attendanceAnalytics.averageRecordedMinutes).toBe(360)

    // Factual attendance-leave overlap on EMP-1003 (2026-11-12 inside 2026-11-11..13 Approved leave)
    expect(report.attendanceAnalytics.leaveOverlaps).toHaveLength(1)
    expect(report.attendanceAnalytics.leaveOverlaps[0]).toMatchObject({
      employeeId: 'EMP-1003',
      attendanceDate: '2026-11-12',
      leaveType: 'Annual Leave',
    })

    // Boundary check: Nov 11 only -> excludes overnight shift starting Nov 10 PHT!
    const nov11Only = await rptSvc.generateReport(
      { startDate: '2026-11-11', endDate: '2026-11-11' },
      { actorEmployeeId: 'EMP-1005' },
    )
    expect(nov11Only.attendanceAnalytics.totalSessions).toBe(0)

    // Boundary check: Nov 10 only -> includes overnight shift exactly once!
    const nov10Only = await rptSvc.generateReport(
      { startDate: '2026-11-10', endDate: '2026-11-10' },
      { actorEmployeeId: 'EMP-1005' },
    )
    expect(nov10Only.attendanceAnalytics.totalSessions).toBe(1)
    expect(nov10Only.attendanceAnalytics.overnightSessionsCount).toBe(1)

    // Leave analytics for Nov 1..Nov 30: includes lv-approved-1, lv-cancelled-1 (overlaps Nov 29..30), lv-rejected-1; excludes Dec 5..6 lv-pending-1
    expect(report.leaveAnalytics.totalRequests).toBe(3)
    expect(report.leaveAnalytics.approvedRequests).toBe(1)
    expect(report.leaveAnalytics.rejectedRequests).toBe(1)
    expect(report.leaveAnalytics.cancelledRequests).toBe(1)
    expect(report.leaveAnalytics.pendingRequests).toBe(0)
    expect(report.leaveAnalytics.approvedCalendarDays).toBe(3)

    // Export sanitization & PII checks
    const empCsv = await rptSvc.exportReportCsv(
      'employees',
      { startDate: '2026-11-01', endDate: '2026-11-30' },
      { actorEmployeeId: 'EMP-1005' },
    )
    expect(empCsv.csvContent).toContain(`"'=HYPERLINK(""http://evil"", ""Nina"")"`)
    expect(empCsv.csvContent).not.toContain('nina.santos@smarthr.demo')
    expect(empCsv.csvContent).not.toContain('jordan.taylor@smarthr.demo')

    const leaveCsv = await rptSvc.exportReportCsv(
      'leave',
      undefined,
      { actorEmployeeId: 'EMP-1005' },
    )
    expect(leaveCsv.csvContent).not.toContain('Private medical appointment')
    expect(leaveCsv.csvContent).not.toContain('Verified coverage')
  })

  it('rejects invalid calendar dates, inverted ranges, unauthorized sessions, inactive users, and filter tampering', async () => {
    const empSvc = createDemoEmployeeService(window.localStorage, fixedNow)
    const attSvc = createDemoAttendanceService({
      employeeService: empSvc,
      storage: window.localStorage,
      now: fixedNow,
    })
    const lvSvc = createDemoLeaveService({
      employeeService: empSvc,
      storage: window.localStorage,
      now: fixedNow,
    })
    const rptSvc = createDemoReportService({
      employeeService: empSvc,
      attendanceService: attSvc,
      leaveService: lvSvc,
      storage: window.localStorage,
      now: fixedNow,
    })

    await empSvc.listDemoSignInProfiles()

    // Create Inactive user
    await empSvc.createEmployee(
      {
        employeeId: 'EMP-2001',
        fullName: 'Former Staff',
        workEmail: 'former.staff@smarthr.demo',
        department: 'Finance',
        position: 'Analyst',
        employmentStatus: 'Inactive',
        hireDate: '2024-01-01',
        assignedRole: 'Employee',
      },
      { actorEmployeeId: 'EMP-1005' },
    )

    // 401 checks
    await expect(
      rptSvc.generateReport(undefined, { actorEmployeeId: null }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 401 })

    await expect(
      rptSvc.generateReport(undefined, {
        actorEmployeeId: 'EMP-1005',
        sessionExpiresAtUtc: '2026-11-15T05:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 401 })

    // 403 Inactive employee
    await expect(
      rptSvc.generateReport(undefined, { actorEmployeeId: 'EMP-2001' }),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_INACTIVE', httpStatus: 403 })

    // Invalid date range checks
    await expect(
      rptSvc.generateReport(
        { startDate: '2026-11-20', endDate: '2026-11-10' },
        { actorEmployeeId: 'EMP-1005' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 })

    await expect(
      rptSvc.generateReport(
        { startDate: '2026-02-30' },
        { actorEmployeeId: 'EMP-1005' },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 })

    // Employee tampering: coworker employeeId / different department / export attempt
    await expect(
      rptSvc.generateReport(
        { employeeId: 'EMP-1003' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    await expect(
      rptSvc.generateReport(
        { department: 'Finance' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    await expect(
      rptSvc.exportReportCsv('employees', undefined, {
        actorEmployeeId: 'EMP-1001',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    // Manager tampering: cross-department & unknown ID blocked; own department allowed
    await expect(
      rptSvc.generateReport(
        { department: 'Finance' },
        { actorEmployeeId: 'EMP-1004' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    await expect(
      rptSvc.generateReport(
        { employeeId: 'EMP-1003' },
        { actorEmployeeId: 'EMP-1004' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    await expect(
      rptSvc.generateReport(
        { employeeId: 'EMP-9999' },
        { actorEmployeeId: 'EMP-1004' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    const managerReport = await rptSvc.generateReport(undefined, {
      actorEmployeeId: 'EMP-1004',
    })
    expect(managerReport.authorizedScope).toBe('team')
    expect(managerReport.employeeAnalytics.employees.map((e) => e.employeeId)).toEqual(
      expect.arrayContaining(['EMP-1001', 'EMP-1004']),
    )
    expect(
      managerReport.employeeAnalytics.employees.some(
        (e) => e.department !== 'Engineering',
      ),
    ).toBe(false)
  })

  it('caches repeat queries safely per role/filter/fingerprint, invalidates on mutation, and rejects oversized exports', async () => {
    const empSvc = createDemoEmployeeService(window.localStorage, fixedNow)
    const attSvc = createDemoAttendanceService({
      employeeService: empSvc,
      storage: window.localStorage,
      now: fixedNow,
    })
    const lvSvc = createDemoLeaveService({
      employeeService: empSvc,
      storage: window.localStorage,
      now: fixedNow,
    })
    const attSpy = vi.spyOn(attSvc, 'listAttendanceRecords')

    const rptSvc = createDemoReportService({
      employeeService: empSvc,
      attendanceService: attSvc,
      leaveService: lvSvc,
      storage: window.localStorage,
      now: fixedNow,
      maxExportRows: 4,
    })

    // Call 1: cache miss
    const r1 = await rptSvc.generateReport(undefined, {
      actorEmployeeId: 'EMP-1005',
    })
    expect(attSpy).toHaveBeenCalledTimes(1)
    expect(r1.employeeAnalytics.totalEmployees).toBe(5)

    // Call 2: exact same actor & filters -> cache hit (no extra service scan)
    const r2 = await rptSvc.generateReport(undefined, {
      actorEmployeeId: 'EMP-1005',
    })
    expect(attSpy).toHaveBeenCalledTimes(1)
    expect(r2.employeeAnalytics.totalEmployees).toBe(5)

    // Call 3: concurrent identical requests deduplicate
    const [m1, m2] = await Promise.all([
      rptSvc.generateReport(
        { department: 'Engineering' },
        { actorEmployeeId: 'EMP-1004' },
      ),
      rptSvc.generateReport(
        { department: 'Engineering' },
        { actorEmployeeId: 'EMP-1004' },
      ),
    ])
    expect(attSpy).toHaveBeenCalledTimes(2)
    expect(m1.employeeAnalytics.totalEmployees).toBe(2)
    expect(m2.employeeAnalytics.totalEmployees).toBe(2)

    // Underlying mutation (clockIn) automatically invalidates cache via storage fingerprint
    await attSvc.clockIn({ employeeId: 'EMP-1001' }, { actorEmployeeId: 'EMP-1001' })
    const r3 = await rptSvc.generateReport(undefined, {
      actorEmployeeId: 'EMP-1005',
    })
    expect(attSpy).toHaveBeenCalledTimes(3)
    expect(r3.attendanceAnalytics.totalSessions).toBe(1)

    // Manual invalidateCache forces recomputation
    rptSvc.invalidateCache()
    await rptSvc.generateReport(undefined, { actorEmployeeId: 'EMP-1005' })
    expect(attSpy).toHaveBeenCalledTimes(4)

    // Export row safety limit enforced (5 synthetic employees > maxExportRows: 4)
    await expect(
      rptSvc.exportReportCsv('employees', undefined, {
        actorEmployeeId: 'EMP-1005',
      }),
    ).rejects.toBeInstanceOf(ReportServiceError)

    await expect(
      rptSvc.exportReportCsv('employees', undefined, {
        actorEmployeeId: 'EMP-1005',
      }),
    ).rejects.toMatchObject({ code: 'EXPORT_LIMIT_EXCEEDED', httpStatus: 400 })
  })

  it('aggregates 1,200+ attendance and leave records accurately and propagates storage corruption cleanly', async () => {
    const empSvc = createDemoEmployeeService(window.localStorage, fixedNow)
    const attSvc = createDemoAttendanceService({
      employeeService: empSvc,
      storage: window.localStorage,
      now: fixedNow,
    })
    const lvSvc = createDemoLeaveService({
      employeeService: empSvc,
      storage: window.localStorage,
      now: fixedNow,
    })
    const rptSvc = createDemoReportService({
      employeeService: empSvc,
      attendanceService: attSvc,
      leaveService: lvSvc,
      storage: window.localStorage,
      now: fixedNow,
    })

    const baseEmps = await empSvc.listEmployees({ actorEmployeeId: 'EMP-1005' })
    const manyEmployees: Employee[] = [...baseEmps]
    for (let i = 1; i <= 50; i += 1) {
      manyEmployees.push({
        id: `bulk-emp-${i}`,
        employeeId: `EMP-${3000 + i}`,
        fullName: `Scale Employee ${i}`,
        workEmail: `scale${i}@smarthr.demo`,
        department: i % 2 === 0 ? 'Engineering' : 'Sales',
        position: 'Associate',
        employmentStatus: 'Active',
        hireDate: '2026-01-15',
        assignedRole: 'Employee',
        createdAt: '2026-01-15T00:00:00.000Z',
      })
    }
    window.localStorage.setItem(
      DEMO_EMPLOYEES_STORAGE_KEY,
      JSON.stringify(manyEmployees),
    )

    const manyAttendance: AttendanceRecord[] = []
    for (let i = 0; i < 1200; i += 1) {
      const empNum = (i % 50) + 1
      const day = String((i % 28) + 1).padStart(2, '0')
      manyAttendance.push({
        id: `att-bulk-${i}`,
        employeeId: `EMP-${3000 + empNum}`,
        employeeName: `Scale Employee ${empNum}`,
        attendanceDate: `2026-11-${day}`,
        clockInAtUtc: `2026-11-${day}T01:00:00.000Z`,
        clockOutAtUtc: `2026-11-${day}T09:00:00.000Z`,
        durationMinutes: 480,
        status: 'Clocked Out',
        businessTimezone: 'Asia/Manila',
        createdAtUtc: `2026-11-${day}T01:00:00.000Z`,
        updatedAtUtc: `2026-11-${day}T09:00:00.000Z`,
      })
    }
    window.localStorage.setItem(
      DEMO_ATTENDANCE_STORAGE_KEY,
      JSON.stringify(manyAttendance),
    )

    const largeReport = await rptSvc.generateReport(undefined, {
      actorEmployeeId: 'EMP-1005',
    })
    expect(largeReport.employeeAnalytics.totalEmployees).toBe(55)
    expect(largeReport.attendanceAnalytics.totalSessions).toBe(1200)
    expect(largeReport.attendanceAnalytics.totalRecordedMinutes).toBe(576000)

    // Corrupted persistence propagates cleanly as PERSISTENCE_ERROR (HTTP 500)
    window.localStorage.setItem(DEMO_LEAVE_STORAGE_KEY, '{corrupted')
    await expect(
      rptSvc.generateReport(undefined, { actorEmployeeId: 'EMP-1005' }),
    ).rejects.toMatchObject({ code: 'PERSISTENCE_ERROR', httpStatus: 500 })
  })
})

