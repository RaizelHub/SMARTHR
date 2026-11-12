import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Attendance from '../../../pages/Attendance'
import { createDemoEmployeeService } from '../../employees/services/employeeService'
import {
  AttendanceServiceError,
  createDemoAttendanceService,
  type AttendanceService,
} from '../services/attendanceService'

function renderAttendancePage(options?: {
  empService?: ReturnType<typeof createDemoEmployeeService>
  attService?: AttendanceService
  initialActorEmployeeId?: string | null
}) {
  return render(
    <MemoryRouter initialEntries={['/attendance']}>
      <Attendance
        empService={options?.empService}
        attService={options?.attService}
        initialActorEmployeeId={options?.initialActorEmployeeId}
      />
    </MemoryRouter>,
  )
}

describe('Attendance Clock-In and Clock-Out integration workflow', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('starts with an honest empty state and allows clock-in, persistence across refresh, and overnight clock-out', async () => {
    const empService = createDemoEmployeeService(window.localStorage)
    let currentTime = new Date('2026-11-12T14:30:00.000Z') // 10:30 PM Asia/Manila

    const attService = createDemoAttendanceService({
      employeeService: empService,
      storage: window.localStorage,
      now: () => currentTime,
    })

    const firstRender = renderAttendancePage({ empService, attService })

    await waitFor(() => {
      expect(screen.getByText('Not Clocked In')).toBeTruthy()
    })

    expect(
      screen.getByText('No attendance records recorded yet'),
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Clock Out' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Clock In' }))

    await waitFor(() => {
      expect(
        screen.getByText(/Clocked in Jordan Taylor \(EMP-1001\)/i),
      ).toBeTruthy()
    })

    expect(
      (screen.getByRole('button', { name: 'Clock In' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Clock Out' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)

    // Simulate page refresh during active overnight shift
    firstRender.unmount()
    currentTime = new Date('2026-11-12T22:45:00.000Z') // 06:45 AM next day Asia/Manila

    const refreshedService = createDemoAttendanceService({
      employeeService: empService,
      storage: window.localStorage,
      now: () => currentTime,
    })

    renderAttendancePage({ empService, attService: refreshedService })

    await waitFor(() => {
      expect(screen.getByText('Active shift in progress')).toBeTruthy()
    })

    expect(
      (screen.getByRole('button', { name: 'Clock In' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Clock Out' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          /Clocked out Jordan Taylor \(EMP-1001\)\. Recorded shift duration: 495 min\./i,
        ),
      ).toBeTruthy()
    })

    expect(screen.getByText('8h 15m')).toBeTruthy()
    expect(screen.getByText(/Next day \(2026-11-13\)/i)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Clock Out' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('isolates attendance records per employee and switches active session with acting demo employee', async () => {
    const empService = createDemoEmployeeService(window.localStorage)
    const attService = createDemoAttendanceService({
      employeeService: empService,
      storage: window.localStorage,
      now: () => new Date('2026-11-12T01:00:00.000Z'),
    })

    renderAttendancePage({ empService, attService })

    await waitFor(() => {
      expect(screen.getByText('Not Clocked In')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clock In' }))

    await waitFor(() => {
      expect(screen.getByText('Active shift in progress')).toBeTruthy()
    })

    // Switch acting demo user to Marcus Chen (EMP-1003, role: Employee)
    fireEvent.change(screen.getByLabelText('Acting Demo Employee'), {
      target: { value: 'EMP-1003' },
    })

    await waitFor(() => {
      expect(screen.getByText('No active work session')).toBeTruthy()
    })

    // Employee EMP-1003 must not see EMP-1001's attendance records
    expect(
      screen.getByText('No attendance records recorded yet'),
    ).toBeTruthy()

    // Switch to Priya Nair (EMP-1002, role: HR Coordinator) to verify HR directory scope
    fireEvent.change(screen.getByLabelText('Acting Demo Employee'), {
      target: { value: 'EMP-1002' },
    })

    await waitFor(() => {
      expect(screen.getByText('EMP-1001')).toBeTruthy()
    })
  })

  it('displays error banner without falsely showing success when clock-in or clock-out request fails', async () => {
    const empService = createDemoEmployeeService(window.localStorage)

    const failingAttService: AttendanceService = {
      isDemoMode: true,
      businessTimezone: 'Asia/Manila',
      listAttendanceRecords: vi.fn().mockResolvedValue([]),
      getActiveSession: vi.fn().mockResolvedValue(null),
      clockIn: vi
        .fn()
        .mockRejectedValue(
          new AttendanceServiceError(
            'PERSISTENCE_ERROR',
            'Simulated attendance save failure.',
          ),
        ),
      clockOut: vi.fn(),
      clearAttendanceRecords: vi.fn().mockResolvedValue([]),
    }

    renderAttendancePage({ empService, attService: failingAttService })

    await waitFor(() => {
      expect(screen.getByText('Not Clocked In')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clock In' }))

    await waitFor(() => {
      expect(screen.getByText('Attendance action failed')).toBeTruthy()
      expect(
        screen.getByText('Simulated attendance save failure.'),
      ).toBeTruthy()
    })

    expect(screen.queryByText('Attendance recorded')).toBeNull()
    expect(screen.getByText('Not Clocked In')).toBeTruthy()
  })

  it('keeps active session and displays error banner when clock-out request fails', async () => {
    const empService = createDemoEmployeeService(window.localStorage)
    const activeRecord = {
      id: 'att-active-1',
      employeeId: 'EMP-1001',
      employeeName: 'Jordan Taylor',
      attendanceDate: '2026-11-12',
      clockInAtUtc: '2026-11-12T01:00:00.000Z',
      clockOutAtUtc: null,
      durationMinutes: null,
      status: 'Clocked In' as const,
      businessTimezone: 'Asia/Manila',
      createdAtUtc: '2026-11-12T01:00:00.000Z',
      updatedAtUtc: '2026-11-12T01:00:00.000Z',
    }

    const failingClockOutService: AttendanceService = {
      isDemoMode: true,
      businessTimezone: 'Asia/Manila',
      listAttendanceRecords: vi.fn().mockResolvedValue([activeRecord]),
      getActiveSession: vi.fn().mockResolvedValue(activeRecord),
      clockIn: vi.fn(),
      clockOut: vi
        .fn()
        .mockRejectedValue(
          new AttendanceServiceError(
            'PERSISTENCE_ERROR',
            'Simulated clock-out failure.',
          ),
        ),
      clearAttendanceRecords: vi.fn().mockResolvedValue([]),
    }

    renderAttendancePage({ empService, attService: failingClockOutService })

    await waitFor(() => {
      expect(screen.getByText('Active shift in progress')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clock Out' }))

    await waitFor(() => {
      expect(screen.getByText('Attendance action failed')).toBeTruthy()
      expect(screen.getByText('Simulated clock-out failure.')).toBeTruthy()
    })

    expect(screen.queryByText('Attendance recorded')).toBeNull()
    expect(screen.getByText('Active shift in progress')).toBeTruthy()
  })
})
