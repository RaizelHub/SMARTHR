import { describe, expect, it } from 'vitest'
import { BUSINESS_TIMEZONE } from '../../../types/attendance'
import {
  calculateDurationMinutes,
  formatShiftDuration,
  formatTimeInBusinessZone,
  getBusinessDateString,
  isOvernightShift,
} from '../utils/timeZone'

describe('attendance timeZone and overnight shift helpers', () => {
  it('converts UTC timestamps near midnight to Asia/Manila business dates', () => {
    // 2026-11-12T15:59:59Z -> 2026-11-12 23:59:59 Asia/Manila
    expect(
      getBusinessDateString('2026-11-12T15:59:59.000Z', BUSINESS_TIMEZONE),
    ).toBe('2026-11-12')

    // 2026-11-12T16:00:00Z -> 2026-11-13 00:00:00 Asia/Manila
    expect(
      getBusinessDateString('2026-11-12T16:00:00.000Z', BUSINESS_TIMEZONE),
    ).toBe('2026-11-13')
  })

  it('detects overnight shifts and calculates exact elapsed minutes', () => {
    const clockInUtc = '2026-11-12T14:30:00.000Z' // 2026-11-12 22:30 Asia/Manila
    const clockOutUtc = '2026-11-12T22:45:00.000Z' // 2026-11-13 06:45 Asia/Manila

    expect(isOvernightShift(clockInUtc, clockOutUtc, BUSINESS_TIMEZONE)).toBe(
      true,
    )
    expect(calculateDurationMinutes(clockInUtc, clockOutUtc)).toBe(495)
    expect(formatShiftDuration(495, clockInUtc, clockOutUtc)).toBe('8h 15m')
    expect(formatTimeInBusinessZone(clockInUtc, BUSINESS_TIMEZONE)).toContain(
      '10:30:00 PM',
    )
    expect(formatTimeInBusinessZone(clockOutUtc, BUSINESS_TIMEZONE)).toContain(
      '06:45:00 AM',
    )
  })

  it('treats same-day shifts as non-overnight and rejects invalid timestamp order', () => {
    const startUtc = '2026-11-12T01:00:00.000Z' // 09:00 AM Asia/Manila
    const endUtc = '2026-11-12T09:05:00.000Z' // 05:05 PM Asia/Manila

    expect(isOvernightShift(startUtc, endUtc, BUSINESS_TIMEZONE)).toBe(false)
    expect(calculateDurationMinutes(startUtc, endUtc)).toBe(485)
    expect(formatShiftDuration(485, startUtc, endUtc)).toBe('8h 05m')
    expect(() => calculateDurationMinutes(endUtc, startUtc)).toThrow()
  })
})

