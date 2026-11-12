import { describe, expect, it } from 'vitest'
import type { CreateEmployeeInput } from '../../../types/employee'
import {
  createDemoEmployeeService,
  DEMO_EMPLOYEES_STORAGE_KEY,
  EmployeeServiceError,
  SYNTHETIC_DEMO_EMPLOYEES,
  type StorageLike,
} from '../services/employeeService'

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

function buildNewEmployeeInput(): CreateEmployeeInput {
  return {
    employeeId: 'EMP-2050',
    fullName: 'Elena Vance',
    workEmail: 'Elena.Vance@smarthr.demo',
    department: 'Product',
    position: 'Product Manager',
    employmentStatus: 'Active',
    hireDate: '2026-10-01',
    assignedRole: 'Manager',
  }
}

const HR_ACTOR = { actorEmployeeId: 'EMP-1002' }
const ADMIN_ACTOR = { actorEmployeeId: 'EMP-1005' }

describe('employeeService (demo local storage)', () => {
  it('seeds synthetic demo employees on first load', async () => {
    const storage = createMemoryStorage()
    const service = createDemoEmployeeService(storage)

    const employees = await service.listEmployees(HR_ACTOR)
    expect(employees).toHaveLength(SYNTHETIC_DEMO_EMPLOYEES.length)
    expect(employees.map((e) => e.employeeId)).toEqual(
      SYNTHETIC_DEMO_EMPLOYEES.map((e) => e.employeeId),
    )
    expect(storage.getItem(DEMO_EMPLOYEES_STORAGE_KEY)).not.toBeNull()
  })

  it('creates and persists a new employee across service instances', async () => {
    const storage = createMemoryStorage()
    const firstInstance = createDemoEmployeeService(storage)
    const created = await firstInstance.createEmployee(
      buildNewEmployeeInput(),
      HR_ACTOR,
    )

    expect(created.employeeId).toBe('EMP-2050')
    expect(created.workEmail).toBe('elena.vance@smarthr.demo')
    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBeTruthy()

    const secondInstance = createDemoEmployeeService(storage)
    const reloaded = await secondInstance.listEmployees(HR_ACTOR)
    expect(reloaded[0]?.employeeId).toBe('EMP-2050')
    expect(reloaded).toHaveLength(SYNTHETIC_DEMO_EMPLOYEES.length + 1)
  })

  it('rejects duplicate employee IDs case-insensitively', async () => {
    const storage = createMemoryStorage()
    const service = createDemoEmployeeService(storage)

    await expect(
      service.createEmployee(
        {
          ...buildNewEmployeeInput(),
          employeeId: 'emp-1001',
        },
        HR_ACTOR,
      ),
    ).rejects.toMatchObject({
      name: 'EmployeeServiceError',
      code: 'DUPLICATE_EMPLOYEE_ID',
    })
  })

  it('rejects duplicate work emails case-insensitively', async () => {
    const storage = createMemoryStorage()
    const service = createDemoEmployeeService(storage)

    await expect(
      service.createEmployee(
        {
          ...buildNewEmployeeInput(),
          workEmail: 'PRIYA.NAIR@SMARTHR.DEMO',
        },
        HR_ACTOR,
      ),
    ).rejects.toMatchObject({
      name: 'EmployeeServiceError',
      code: 'DUPLICATE_WORK_EMAIL',
    })
  })

  it('supports clearing employees for empty state and resetting demo data', async () => {
    const storage = createMemoryStorage()
    const service = createDemoEmployeeService(storage)

    const cleared = await service.clearEmployees(ADMIN_ACTOR)
    expect(cleared).toEqual([])
    expect(await service.listEmployees(ADMIN_ACTOR)).toEqual([])

    const restored = await service.resetDemoEmployees(ADMIN_ACTOR)
    expect(restored).toHaveLength(SYNTHETIC_DEMO_EMPLOYEES.length)
  })

  it('throws EmployeeServiceError when storage fails or contains corrupted data', async () => {
    const corruptedStorage = createMemoryStorage({
      [DEMO_EMPLOYEES_STORAGE_KEY]: '{bad-json',
    })
    const corruptedService = createDemoEmployeeService(corruptedStorage)

    await expect(corruptedService.listEmployees(HR_ACTOR)).rejects.toBeInstanceOf(
      EmployeeServiceError,
    )

    const failingWriteStorage: StorageLike = {
      getItem: () => JSON.stringify([]),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => undefined,
    }
    const failingService = createDemoEmployeeService(failingWriteStorage)

    await expect(
      failingService.createEmployee(buildNewEmployeeInput(), HR_ACTOR),
    ).rejects.toMatchObject({
      code: 'PERSISTENCE_ERROR',
    })
  })
})
