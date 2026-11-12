import type { AssignedRole, Department } from './employee'

export const LEAVE_TYPES = [
  'Annual Leave',
  'Sick Leave',
  'Emergency Leave',
  'Unpaid Leave',
  'Parental Leave',
  'Other Authorized Leave',
] as const

export type LeaveType = (typeof LEAVE_TYPES)[number]

export const LEAVE_REQUEST_STATUSES = [
  'Pending',
  'Approved',
  'Rejected',
  'Cancelled',
] as const

export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number]

export const LEAVE_DECISION_ACTIONS = [
  'Submitted',
  'Approved',
  'Rejected',
  'Cancelled',
] as const

export type LeaveDecisionAction = (typeof LEAVE_DECISION_ACTIONS)[number]

export interface LeaveDecisionEntry {
  action: LeaveDecisionAction
  actorEmployeeId: string
  actorName: string
  actorRole: AssignedRole
  timestampUtc: string
  note: string | null
}

export interface LeaveRequest {
  id: string
  employeeId: string
  employeeName: string
  department: Department
  leaveType: LeaveType
  startDate: string
  endDate: string
  calendarDays: number
  reason: string
  status: LeaveRequestStatus
  businessTimezone: string
  submittedAtUtc: string
  reviewedByEmployeeId: string | null
  reviewedByName: string | null
  reviewedByRole: AssignedRole | null
  reviewedAtUtc: string | null
  reviewerNote: string | null
  cancelledAtUtc: string | null
  decisionHistory: LeaveDecisionEntry[]
  updatedAtUtc: string
}

export interface SubmitLeaveRequestInput {
  employeeId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  reason?: string
}

export interface ReviewLeaveRequestInput {
  requestId: string
  decision: 'Approved' | 'Rejected'
  reviewerNote?: string
}

export interface LeaveActorContext {
  actorEmployeeId: string | null | undefined
  sessionExpiresAtUtc?: string | null
}

