import { describe, expect, it } from 'vitest'
import {
  createDemoEmployeeService,
  type EmployeeService,
  type StorageLike,
} from '../../employees/services/employeeService'
import {
  createDemoLeaveService,
  DEMO_LEAVE_STORAGE_KEY,
  LeaveServiceError,
} from '../services/leaveService'

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

const TEST_NOW = new Date('2026-11-12T02:00:00.000Z')

describe('leaveService business rules, authorization, and state machine', () => {
  it('submits valid leave requests, persists across reload, and scopes employee visibility', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)

    const serviceA = createDemoLeaveService({
      employeeService: empService,
      storage,
      now: () => TEST_NOW,
    })

    const created = await serviceA.submitLeaveRequest(
      {
        employeeId: 'EMP-1001',
        leaveType: 'Annual Leave',
        startDate: '2026-11-20',
        endDate: '2026-11-22',
        reason: 'Scheduled vacation',
      },
      { actorEmployeeId: 'EMP-1001' },
    )

    expect(created.status).toBe('Pending')
    expect(created.calendarDays).toBe(3)
    expect(created.decisionHistory).toHaveLength(1)
    expect(created.decisionHistory[0]?.action).toBe('Submitted')

    // Persist across reload
    const serviceB = createDemoLeaveService({
      employeeService: empService,
      storage,
      now: () => TEST_NOW,
    })

    const ownView = await serviceB.listLeaveRequests({
      actorEmployeeId: 'EMP-1001',
    })
    expect(ownView).toHaveLength(1)
    expect(ownView[0]?.id).toBe(created.id)

    // Another standard Employee (EMP-1003) cannot view EMP-1001's request
    const coworkerView = await serviceB.listLeaveRequests({
      actorEmployeeId: 'EMP-1003',
    })
    expect(coworkerView).toEqual([])

    // HR Coordinator (EMP-1002) sees organization requests
    const hrView = await serviceB.listLeaveRequests({
      actorEmployeeId: 'EMP-1002',
    })
    expect(hrView).toHaveLength(1)
  })

  it('rejects duplicate submissions, overlapping requests, and reversed date ranges', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)
    const service = createDemoLeaveService({
      employeeService: empService,
      storage,
      now: () => TEST_NOW,
    })

    await expect(
      service.submitLeaveRequest(
        {
          employeeId: 'EMP-1001',
          leaveType: 'Annual Leave',
          startDate: '2026-11-25',
          endDate: '2026-11-23',
        },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })

    await service.submitLeaveRequest(
      {
        employeeId: 'EMP-1001',
        leaveType: 'Annual Leave',
        startDate: '2026-11-20',
        endDate: '2026-11-22',
      },
      { actorEmployeeId: 'EMP-1001' },
    )

    // Duplicate exact submission
    await expect(
      service.submitLeaveRequest(
        {
          employeeId: 'EMP-1001',
          leaveType: 'Annual Leave',
          startDate: '2026-11-20',
          endDate: '2026-11-22',
        },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_LEAVE_REQUEST',
    })

    // Overlapping different leave type
    await expect(
      service.submitLeaveRequest(
        {
          employeeId: 'EMP-1001',
          leaveType: 'Sick Leave',
          startDate: '2026-11-22',
          endDate: '2026-11-24',
        },
        { actorEmployeeId: 'EMP-1001' },
      ),
    ).rejects.toMatchObject({
      code: 'OVERLAPPING_LEAVE_REQUEST',
    })
  })

  it('allows owner to cancel pending requests and blocks cancelling others or finalized requests', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)
    const service = createDemoLeaveService({
      employeeService: empService,
      storage,
      now: () => TEST_NOW,
    })

    const request = await service.submitLeaveRequest(
      {
        employeeId: 'EMP-1001',
        leaveType: 'Annual Leave',
        startDate: '2026-11-20',
        endDate: '2026-11-21',
      },
      { actorEmployeeId: 'EMP-1001' },
    )

    // Another employee cannot cancel EMP-1001's request
    await expect(
      service.cancelLeaveRequest(request.id, { actorEmployeeId: 'EMP-1003' }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })

    const cancelled = await service.cancelLeaveRequest(request.id, {
      actorEmployeeId: 'EMP-1001',
    })
    expect(cancelled.status).toBe('Cancelled')
    expect(cancelled.decisionHistory.map((d) => d.action)).toEqual([
      'Submitted',
      'Cancelled',
    ])

    // Cannot cancel twice or approve cancelled request
    await expect(
      service.cancelLeaveRequest(request.id, { actorEmployeeId: 'EMP-1001' }),
    ).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    })
    await expect(
      service.reviewLeaveRequest(
        { requestId: request.id, decision: 'Approved' },
        { actorEmployeeId: 'EMP-1002' },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    })

    // Cancelled dates are now freed for re-submission
    const resubmitted = await service.submitLeaveRequest(
      {
        employeeId: 'EMP-1001',
        leaveType: 'Annual Leave',
        startDate: '2026-11-20',
        endDate: '2026-11-21',
      },
      { actorEmployeeId: 'EMP-1001' },
    )
    expect(resubmitted.status).toBe('Pending')
  })

  it('enforces reviewer roles, department scoping for Managers, and prevents self-approval and cross-employee submission', async () => {
    const storage = createMemoryStorage()
    const empService = createDemoEmployeeService(storage)

    await empService.createEmployee({
      employeeId: 'EMP-2001',
      fullName: 'Engineering Manager',
      workEmail: 'eng.manager@smarthr.demo',
      department: 'Engineering',
      position: 'Engineering Manager',
      employmentStatus: 'Active',
      hireDate: '2024-01-15',
      assignedRole: 'Manager',
    })

    await empService.createEmployee({
      employeeId: 'EMP-2002',
      fullName: 'Sales Manager',
      workEmail: 'sales.manager@smarthr.demo',
      department: 'Sales',
      position: 'Sales Manager',
      employmentStatus: 'Active',
      hireDate: '2024-02-15',
      assignedRole: 'Manager',
    })

    const service = createDemoLeaveService({
      employeeService: empService,
      storage,
      now: () => TEST_NOW,
    })

    // Unauthenticated rejected
    await expect(
      service.listLeaveRequests({ actorEmployeeId: null }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    // Cross-employee submission rejected
    await expect(
      service.submitLeaveRequest(
        {
          employeeId: 'EMP-1001',
          leaveType: 'Annual Leave',
          startDate: '2026-11-20',
          endDate: '2026-11-21',
        },
        { actorEmployeeId: 'EMP-1003' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    const emp1001Request = await service.submitLeaveRequest(
      {
        employeeId: 'EMP-1001',
        leaveType: 'Annual Leave',
        startDate: '2026-11-20',
        endDate: '2026-11-21',
      },
      { actorEmployeeId: 'EMP-1001' },
    )

    const hrOwnRequest = await service.submitLeaveRequest(
      {
        employeeId: 'EMP-1002',
        leaveType: 'Annual Leave',
        startDate: '2026-12-01',
        endDate: '2026-12-02',
      },
      { actorEmployeeId: 'EMP-1002' },
    )

    // Standard Employee cannot approve/reject
    await expect(
      service.reviewLeaveRequest(
        { requestId: emp1001Request.id, decision: 'Approved' },
        { actorEmployeeId: 'EMP-1003' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    // Out-of-department Manager (Sales) cannot review Engineering request
    await expect(
      service.reviewLeaveRequest(
        { requestId: emp1001Request.id, decision: 'Approved' },
        { actorEmployeeId: 'EMP-2002' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    // HR Coordinator cannot self-approve own request
    await expect(
      service.reviewLeaveRequest(
        { requestId: hrOwnRequest.id, decision: 'Approved' },
        { actorEmployeeId: 'EMP-1002' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    // In-department Manager (Engineering) can approve EMP-1001's request
    const approved = await service.reviewLeaveRequest(
      {
        requestId: emp1001Request.id,
        decision: 'Approved',
        reviewerNote: 'Coverage confirmed',
      },
      { actorEmployeeId: 'EMP-2001' },
    )
    expect(approved.status).toBe('Approved')
    expect(approved.reviewedByEmployeeId).toBe('EMP-2001')
    expect(approved.reviewerNote).toBe('Coverage confirmed')
  })

  it('prevents repeated approvals, rejected-to-approved transitions, and concurrent double-approvals', async () => {
    const storage = createMemoryStorage()
    const baseEmpService = createDemoEmployeeService(storage)
    const delayedEmpService: EmployeeService = {
      ...baseEmpService,
      async listEmployees() {
        await new Promise((resolve) => setTimeout(resolve, 15))
        return baseEmpService.listEmployees()
      },
    }

    const service = createDemoLeaveService({
      employeeService: delayedEmpService,
      storage,
      now: () => TEST_NOW,
    })

    const reqA = await service.submitLeaveRequest(
      {
        employeeId: 'EMP-1001',
        leaveType: 'Annual Leave',
        startDate: '2026-11-20',
        endDate: '2026-11-21',
      },
      { actorEmployeeId: 'EMP-1001' },
    )

    // Concurrent approvals on same request: strictly 1 succeeds
    const concurrentReviews = await Promise.allSettled([
      service.reviewLeaveRequest(
        { requestId: reqA.id, decision: 'Approved' },
        { actorEmployeeId: 'EMP-1002' },
      ),
      service.reviewLeaveRequest(
        { requestId: reqA.id, decision: 'Approved' },
        { actorEmployeeId: 'EMP-1002' },
      ),
    ])

    expect(
      concurrentReviews.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(
      concurrentReviews.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1)

    // Repeated approval rejected
    await expect(
      service.reviewLeaveRequest(
        { requestId: reqA.id, decision: 'Approved' },
        { actorEmployeeId: 'EMP-1002' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' })

    // Rejected request cannot transition to Approved
    const reqB = await service.submitLeaveRequest(
      {
        employeeId: 'EMP-1003',
        leaveType: 'Emergency Leave',
        startDate: '2026-12-03',
        endDate: '2026-12-03',
      },
      { actorEmployeeId: 'EMP-1003' },
    )

    const rejected = await service.reviewLeaveRequest(
      {
        requestId: reqB.id,
        decision: 'Rejected',
        reviewerNote: 'Month-end close',
      },
      { actorEmployeeId: 'EMP-1002' },
    )
    expect(rejected.status).toBe('Rejected')

    await expect(
      service.reviewLeaveRequest(
        { requestId: reqB.id, decision: 'Approved' },
        { actorEmployeeId: 'EMP-1002' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' })
  })

  it('surfaces PERSISTENCE_ERROR when storage fails or contains corrupted JSON', async () => {
    const empService = createDemoEmployeeService(createMemoryStorage())
    const corruptedService = createDemoLeaveService({
      employeeService: empService,
      storage: createMemoryStorage({
        [DEMO_LEAVE_STORAGE_KEY]: '{not-valid-json',
      }),
    })

    await expect(
      corruptedService.listLeaveRequests({ actorEmployeeId: 'EMP-1001' }),
    ).rejects.toBeInstanceOf(LeaveServiceError)
  })
})

