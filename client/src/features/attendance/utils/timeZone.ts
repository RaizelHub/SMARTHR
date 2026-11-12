import { BUSINESS_TIMEZONE } from '../../../types/attendance'

interface DateTimePartsMap {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

function getTimeZoneParts(
  utcIso: string,
  timeZone: string = BUSINESS_TIMEZONE,
): DateTimePartsMap {
  const date = new Date(utcIso)
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid UTC timestamp: "${utcIso}"`)
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const map: Partial<DateTimePartsMap> = {}
  for (const part of parts) {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day' ||
      part.type === 'hour' ||
      part.type === 'minute' ||
      part.type === 'second'
    ) {
      map[part.type] = part.value
    }
  }

  if (
    !map.year ||
    !map.month ||
    !map.day ||
    !map.hour ||
    !map.minute ||
    !map.second
  ) {
    throw new Error('Unable to extract timezone date parts')
  }

  return map as DateTimePartsMap
}

export function getBusinessDateString(
  utcIso: string,
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  const parts = getTimeZoneParts(utcIso, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function formatTimeInBusinessZone(
  utcIso: string,
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  const date = new Date(utcIso)
  if (Number.isNaN(date.getTime())) {
    return 'Invalid time'
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatDateTimeInBusinessZone(
  utcIso: string,
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  const date = new Date(utcIso)
  if (Number.isNaN(date.getTime())) {
    return 'Invalid timestamp'
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

export function isOvernightShift(
  clockInAtUtc: string,
  clockOutAtUtc: string | null,
  timeZone: string = BUSINESS_TIMEZONE,
): boolean {
  if (!clockOutAtUtc) {
    return false
  }
  return (
    getBusinessDateString(clockInAtUtc, timeZone) !==
    getBusinessDateString(clockOutAtUtc, timeZone)
  )
}

export function calculateDurationMinutes(
  clockInAtUtc: string,
  clockOutAtUtc: string,
): number {
  const clockInMs = Date.parse(clockInAtUtc)
  const clockOutMs = Date.parse(clockOutAtUtc)

  if (Number.isNaN(clockInMs) || Number.isNaN(clockOutMs)) {
    throw new RangeError('Invalid UTC timestamp for duration calculation')
  }

  if (clockOutMs < clockInMs) {
    throw new RangeError('Clock-out time cannot be earlier than clock-in time')
  }

  return Math.floor((clockOutMs - clockInMs) / 60000)
}

export function formatShiftDuration(
  durationMinutes: number | null,
  clockInAtUtc?: string,
  clockOutAtUtc?: string | null,
): string {
  if (durationMinutes === null) {
    return 'In progress'
  }

  if (durationMinutes === 0 && clockInAtUtc && clockOutAtUtc) {
    const diffMs = Date.parse(clockOutAtUtc) - Date.parse(clockInAtUtc)
    if (diffMs > 0) {
      return '< 1 min'
    }
  }

  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60
  if (hours === 0) {
    return `${minutes}m`
  }
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

