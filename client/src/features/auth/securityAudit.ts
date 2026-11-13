import type { AssignedRole } from '../../types/employee'
import type { StorageLike } from '../employees/services/employeeService'

export const DEMO_SECURITY_AUDIT_KEY = 'smarthr.demo.securityAudit.v1'

export type SecurityAuditEventType =
  | 'ROLE_CHANGED'
  | 'ROLE_CHANGE_DENIED'
  | 'DIRECTORY_CLEARED'
  | 'DIRECTORY_RESET'
  | 'EMPLOYEE_CREATED'
  | 'EMPLOYEE_UPDATED'
  | 'EMPLOYEE_DEACTIVATED'
  | 'EMPLOYEE_DELETE_BLOCKED'
  | 'EMPLOYEE_CREATE_DENIED'
  | 'EMPLOYEE_UPDATE_DENIED'
  | 'EMPLOYEE_ACCESS_DENIED'
  | 'LEAVE_REVIEW_DENIED'
  | 'LEAVE_SELF_APPROVAL_BLOCKED'
  | 'REPORT_EXPORT_DENIED'
  | 'COMPENSATION_CREATED'
  | 'COMPENSATION_DENIED'
  | 'PAYROLL_PERIOD_CREATED'
  | 'PAYROLL_DRAFT_GENERATED'
  | 'PAYROLL_ADJUSTMENT_ADDED'
  | 'PAYROLL_MARKED_IN_REVIEW'
  | 'PAYROLL_ACCESS_DENIED'

export interface SecurityAuditEntry {
  id: string
  eventType: SecurityAuditEventType
  actorEmployeeId: string
  actorRole: AssignedRole | 'Unauthenticated'
  targetEmployeeId: string | null
  summary: string
  timestampUtc: string
}

function resolveStorage(customStorage?: StorageLike | null): StorageLike | null {
  if (customStorage !== undefined) {
    return customStorage
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

function generateAuditId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `audit-${globalThis.crypto.randomUUID()}`
  }
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function isSessionExpired(
  sessionExpiresAtUtc: string | null | undefined,
  referenceDate: Date = new Date(),
): boolean {
  if (sessionExpiresAtUtc === undefined || sessionExpiresAtUtc === null) {
    return false
  }
  const expiresMs = Date.parse(sessionExpiresAtUtc)
  if (Number.isNaN(expiresMs)) {
    return true
  }
  return expiresMs <= referenceDate.getTime()
}

export function appendSecurityAuditEvent(
  entry: Omit<SecurityAuditEntry, 'id'>,
  customStorage?: StorageLike | null,
): SecurityAuditEntry {
  const fullEntry: SecurityAuditEntry = {
    id: generateAuditId(),
    ...entry,
  }

  const storage = resolveStorage(customStorage)
  if (!storage) {
    return fullEntry
  }

  try {
    const existingRaw = storage.getItem(DEMO_SECURITY_AUDIT_KEY)
    const parsed: unknown = existingRaw ? JSON.parse(existingRaw) : []
    const existing = Array.isArray(parsed) ? (parsed as SecurityAuditEntry[]) : []
    const updated = [fullEntry, ...existing].slice(0, 100)
    storage.setItem(DEMO_SECURITY_AUDIT_KEY, JSON.stringify(updated))
  } catch {
    // Audit logging should not silently crash demo storage if quota is constrained
  }

  return fullEntry
}

export function readSecurityAuditEvents(
  customStorage?: StorageLike | null,
): SecurityAuditEntry[] {
  const storage = resolveStorage(customStorage)
  if (!storage) {
    return []
  }

  try {
    const raw = storage.getItem(DEMO_SECURITY_AUDIT_KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed as SecurityAuditEntry[]
  } catch {
    return []
  }
}

