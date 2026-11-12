export const ATTENDANCE_STATUSES = ['Clocked In', 'Clocked Out'] as const

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const BUSINESS_TIMEZONE = 'Asia/Manila' as const

export interface AttendanceRecord {
  id: string
  employeeId: string
  employeeName: string
  attendanceDate: string
  clockInAtUtc: string
  clockOutAtUtc: string | null
  durationMinutes: number | null
  status: AttendanceStatus
  businessTimezone: string
  createdAtUtc: string
  updatedAtUtc: string
}

export interface ClockInInput {
  employeeId: string
}

export interface ClockOutInput {
  employeeId: string
  sessionId?: string
}

export interface AttendanceActorContext {
  actorEmployeeId: string | null | undefined
  sessionExpiresAtUtc?: string | null
}

