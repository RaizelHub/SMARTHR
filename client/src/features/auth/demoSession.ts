import type { StorageLike } from '../employees/services/employeeService'

/**
 * DEMO-ONLY ACTOR CONTEXT
 *
 * Backend authentication and session tokens do not exist yet.
 * This helper stores which synthetic/registered employee is selected
 * in the Demo Acting Employee switcher so refreshes preserve the active user.
 */
export const DEMO_ACTING_EMPLOYEE_KEY = 'smarthr.demo.actingEmployeeId.v1'

function resolveStorage(customStorage?: StorageLike | null): StorageLike | null {
  if (customStorage !== undefined) {
    return customStorage
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

export function getDemoActingEmployeeId(
  customStorage?: StorageLike | null,
): string | null {
  const storage = resolveStorage(customStorage)
  if (!storage) {
    return null
  }
  try {
    const value = storage.getItem(DEMO_ACTING_EMPLOYEE_KEY)
    return value && value.trim().length > 0 ? value : null
  } catch {
    return null
  }
}

export function setDemoActingEmployeeId(
  employeeId: string | null,
  customStorage?: StorageLike | null,
): void {
  const storage = resolveStorage(customStorage)
  if (!storage) {
    return
  }
  try {
    if (!employeeId || employeeId.trim().length === 0) {
      storage.removeItem(DEMO_ACTING_EMPLOYEE_KEY)
    } else {
      storage.setItem(DEMO_ACTING_EMPLOYEE_KEY, employeeId.trim())
    }
  } catch {
    // Non-fatal in demo selector if storage is unavailable
  }
}

