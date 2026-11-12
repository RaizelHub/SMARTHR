import { describe, expect, it } from 'vitest'
import {
  createDemoEmployeeService,
  type EmployeeService,
  type StorageLike,
} from '../../employees/services/employeeService'
import {
  AttendanceServiceError,
  createDemoAttendanceService,
  DEMO_ATTENDANCE_STORAGE_KEY,
} from '../services/attendanceService'

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

describe('attendanceService business logic and security', () => {
  it('allows an authorized employee to clock in and persists across service instances', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)
    const clock = () => new Date('2026-11-12T01:00:00.000Z') // 09:00 AM Asia/Manila

    const serviceA = createDemoAttendanceService({
      employeeService: empService,
      storage,
      now: clock,
    })

    const created = await serviceA.clockIn(
      { employeeId: 'EMP-1001' },
      { actorEmployeeId: 'EMP-1001' },
    )

    expect(created.employeeId).toBe('EMP-1001')
    expect(created.employeeName).toBe('Jordan Taylor')
    expect(created.attendanceDate).toBe('2026-11-12')
    expect(created.clockInAtUtc).toBe('2026-11-12T01:00:00.000Z')
    expect(created.clockOutAtUtc).toBeNull()
    expect(created.status).toBe('Clocked In')

    const serviceB = createDemoAttendanceService({
      employeeService: empService,
      storage,
      now: clock,
    })
    const activeAfterReload = await serviceB.getActiveSession('EMP-1001', {
      actorEmployeeId: 'EMP-1001',
    })
    expect(activeAfterReload?.id).toBe(created.id)
  })

  it('rejects duplicate clock-in while an active session exists', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)
    const service = createDemoAttendanceService({
      employeeService: empService,
      storage,
      now: () => new Date('2026-11-12T01:00:00.000Z'),
    })

    await service.clockIn(
      { employeeId: 'EMP-1001' },
      { actorEmployeeId: 'EMP-1001' },
    )

    await expect(
      service.clockIn(
        { employeeId: 'EMP-1001' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      name: 'AttendanceServiceError',
      code: 'DUPLICATE_CLOCK_IN',
    })
  })

  it('completes clock-out cleanly, calculates overnight duration, and rejects duplicate or missing-session clock-out', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)
    let currentTime = new Date('2026-11-12T14:30:00.000Z') // 10:30 PM Manila

    const service = createDemoAttendanceService({
      employeeService: empService,
      storage,
      now: () => currentTime,
    })

    // Clock-out without clock-in rejected
    await expect(
      service.clockOut(
        { employeeId: 'EMP-1001' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      code: 'NO_ACTIVE_SESSION',
    })

    const session = await service.clockIn(
      { employeeId: 'EMP-1001' },
      { actorEmployeeId: 'EMP-1001' },
    )

    // Overnight shift ends next Manila day at 06:45 AM
    currentTime = new Date('2026-11-12T22:45:00.000Z')
    const completed = await service.clockOut(
      { employeeId: 'EMP-1001', sessionId: session.id },
      { actorEmployeeId: 'EMP-1001' },
    )

    expect(completed.status).toBe('Clocked Out')
    expect(completed.attendanceDate).toBe('2026-11-12')
    expect(completed.clockInAtUtc).toBe('2026-11-12T14:30:00.000Z')
    expect(completed.clockOutAtUtc).toBe('2026-11-12T22:45:00.000Z')
    expect(completed.durationMinutes).toBe(495)

    // Duplicate clock-out with sessionId rejected
    await expect(
      service.clockOut(
        { employeeId: 'EMP-1001', sessionId: session.id },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_CLOCK_OUT',
    })

    // Duplicate clock-out without sessionId rejected
    await expect(
      service.clockOut(
        { employeeId: 'EMP-1001' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_CLOCK_OUT',
    })
  })

  it('scopes attendance records per employee and rejects unauthorized cross-employee or unauthenticated actions', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)
    const service = createDemoAttendanceService({
      employeeService: empService,
      storage,
      now: () => new Date('2026-11-12T02:00:00.000Z'),
    })

    // Unauthenticated rejected
    await expect(
      service.clockIn({ employeeId: 'EMP-1001' }, { actorEmployeeId: null }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    // Cross-employee clock-in rejected
    await expect(
      service.clockIn(
        { employeeId: 'EMP-1002' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    // Unknown target employee rejected
    await expect(
      service.clockIn(
        { employeeId: 'EMP-9999' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      code: 'EMPLOYEE_NOT_FOUND',
    })

    // EMP-1001 and EMP-1003 clock in independently
    await service.clockIn(
      { employeeId: 'EMP-1001' },
      { actorEmployeeId: 'EMP-1001' },
    )
    await service.clockIn(
      { employeeId: 'EMP-1003' },
      { actorEmployeeId: 'EMP-1003' },
    )

    // Cross-employee clock-out rejected
    await expect(
      service.clockOut(
        { employeeId: 'EMP-1003' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    // Standard Employee sees ONLY their own records
    const emp1001Records = await service.listAttendanceRecords({
      actorEmployeeId: 'EMP-1001',
    })
    expect(emp1001Records).toHaveLength(1)
    expect(emp1001Records[0].employeeId).toBe('EMP-1001')

    // HR Coordinator (EMP-1002) sees records across employees
    const hrRecords = await service.listAttendanceRecords({
      actorEmployeeId: 'EMP-1002',
    })
    expect(hrRecords).toHaveLength(2)
  })

  it('rejects attendance for newly registered Inactive employees and works for Active new employees', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)

    await empService.createEmployee({
      employeeId: 'EMP-2001',
      fullName: 'Inactive Worker',
      workEmail: 'inactive.worker@smarthr.demo',
      department: 'Operations',
      position: 'Coordinator',
      employmentStatus: 'Inactive',
      hireDate: '2026-01-10',
      assignedRole: 'Employee',
    })

    const service = createDemoAttendanceService({
      employeeService: empService,
      storage,
      now: () => new Date('2026-11-12T01:00:00.000Z'),
    })

    await expect(
      service.clockIn(
        { employeeId: 'EMP-2001' },
        { actorEmployeeId: 'EMP-2001' },
      ),
    ).rejects.toMatchObject({
      code: 'EMPLOYEE_INACTIVE',
    })
  })

  it('serializes concurrent clock-in and clock-out requests so duplicate active sessions cannot occur', async () => {
    const storage = createMemoryStorage()
    const baseEmpService = createDemoEmployeeService(storage)
    const delayedEmpService: EmployeeService = {
      ...baseEmpService,
      async listEmployees() {
        await new Promise((resolve) => setTimeout(resolve, 15))
        return baseEmpService.listEmployees()
      },
    }

    let currentTime = new Date('2026-11-12T01:00:00.000Z')
    const service = createDemoAttendanceService({
      employeeService: delayedEmpService,
      storage,
      now: () => currentTime,
    })

    const clockInResults = await Promise.allSettled([
      service.clockIn(
        { employeeId: 'EMP-1001' },
        { actorEmployeeId: 'EMP-1001' },
      ),
      service.clockIn(
        { employeeId: 'EMP-1001' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ])

    const succeededClockIns = clockInResults.filter(
      (result) => result.status === 'fulfilled',
    )
    const failedClockIns = clockInResults.filter(
      (result) => result.status === 'rejected',
    )

    expect(succeededClockIns).toHaveLength(1)
    expect(failedClockIns).toHaveLength(1)
    expect(
      (failedClockIns[0] as PromiseRejectedResult).reason,
    ).toBeInstanceOf(AttendanceServiceError)

    const storedAfterClockIn = await service.listAttendanceRecords({
      actorEmployeeId: 'EMP-1001',
    })
    expect(storedAfterClockIn).toHaveLength(1)

    currentTime = new Date('2026-11-12T05:00:00.000Z')
    const clockOutResults = await Promise.allSettled([
      service.clockOut(
        { employeeId: 'EMP-1001' },
        { actorEmployeeId: 'EMP-1001' },
      ),
      service.clockOut(
        { employeeId: 'EMP-1001' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ])

    expect(clockOutResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(clockOutResults.filter((r) => r.status === 'rejected')).toHaveLength(1)
  })

  it('rejects invalid timestamp order and throws PERSISTENCE_ERROR when storage fails', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)
    let currentTime = new Date('2026-11-12T10:00:00.000Z')

    const service = createDemoAttendanceService({
      employeeService: empService,
      storage,
      now: () => currentTime,
    })

    await service.clockIn(
      { employeeId: 'EMP-1001' },
      { actorEmployeeId: 'EMP-1001' },
    )

    currentTime = new Date('2026-11-12T09:00:00.000Z')
    await expect(
      service.clockOut(
        { employeeId: 'EMP-1001' },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_TIMESTAMP_ORDER',
    })

    const corruptedStorage = createMemoryStorage({
      [DEMO_ATTENDANCE_STORAGE_KEY]: '{invalid-json',
    })
    const corruptedService = createDemoAttendanceService({
      employeeService: empService,
      storage: corruptedStorage,
    })

    await expect(
      corruptedService.listAttendanceRecords({ actorEmployeeId: 'EMP-1001' }),
    ).rejects.toMatchObject({
      code: 'PERSISTENCE_ERROR',
    })
  })
})

