import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Reports from '../../../pages/Reports'
import { AppRoutes } from '../../../routes/AppRouter'
import type { AttendanceRecord } from '../../../types/attendance'
import {
  createDemoAttendanceService,
  DEMO_ATTENDANCE_STORAGE_KEY,
} from '../../attendance/services/attendanceService'
import { AuthProvider } from '../../auth/AuthContext'
import { createDemoAuthService } from '../../auth/authService'
import { employeeService } from '../../employees/services/employeeService'
import { createDemoLeaveService } from '../../leave/services/leaveService'
import {
  createDemoReportService,
  ReportServiceError,
} from '../services/reportService'

function renderAppAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

async function signInViaUi(employeeId: string) {
  await waitFor(() => {
    expect(screen.getByLabelText('Demo Account')).toBeTruthy()
  })
  fireEvent.change(screen.getByLabelText('Demo Account'), {
    target: { value: employeeId },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
}

function getMainNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Main navigation' })
}

function formatOffsetUtcDate(daysAhead: number): string {
  const now = new Date()
  const target = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysAhead,
    ),
  )
  const y = target.getUTCFullYear()
  const m = String(target.getUTCMonth() + 1).padStart(2, '0')
  const d = String(target.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

describe('Reports & Analytics UI, Scoping, Filtering, Exports, Pagination, and Error Recovery', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('redirects unauthenticated /reports visits to Sign In and hides restricted analytics', async () => {
    renderAppAt('/reports')
    await waitFor(() => {
      expect(screen.getByText('Sign In to Smart HR')).toBeTruthy()
    })
    expect(screen.queryByText('Workforce & Department Analytics')).toBeNull()
  })

  it('enforces Employee personal scope and hides bulk CSV export controls', async () => {
    const attSvc = createDemoAttendanceService({
      employeeService,
      storage: window.localStorage,
    })
    await attSvc.clockIn(
      { employeeId: 'EMP-1001' },
      { actorEmployeeId: 'EMP-1001' },
    )
    await attSvc.clockIn(
      { employeeId: 'EMP-1003' },
      { actorEmployeeId: 'EMP-1003' },
    )

    renderAppAt('/')
    await signInViaUi('EMP-1001')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    })

    expect(within(getMainNav()).getByText('Reports')).toBeTruthy()
    fireEvent.click(within(getMainNav()).getByText('Reports'))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Reports & Analytics' }),
      ).toBeTruthy()
      expect(screen.getByTestId('kpi-total-employees').textContent).toBe('1')
    })

    expect(screen.getByTestId('report-scope-banner').textContent).toContain(
      'Personal Scope',
    )
    expect(screen.queryByRole('button', { name: 'Export Workforce CSV' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Export Attendance CSV' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Export Leave CSV' })).toBeNull()
    expect(screen.queryByText('Marcus Chen')).toBeNull()
    expect(screen.getByText(/Leave Balances Not Configured/i)).toBeTruthy()
    expect(screen.getByText(/Attendance Policy Notice/i)).toBeTruthy()
  })

  it('enforces Manager Engineering team scope and supports CSV download confirmation', async () => {
    const lvSvc = createDemoLeaveService({
      employeeService,
      storage: window.localStorage,
    })
    const futureDate = formatOffsetUtcDate(4)
    await lvSvc.submitLeaveRequest(
      {
        employeeId: 'EMP-1001',
        leaveType: 'Annual Leave',
        startDate: futureDate,
        endDate: futureDate,
        reason: 'Private trip note',
      },
      { actorEmployeeId: 'EMP-1001' },
    )
    await lvSvc.submitLeaveRequest(
      {
        employeeId: 'EMP-1003',
        leaveType: 'Sick Leave',
        startDate: futureDate,
        endDate: futureDate,
      },
      { actorEmployeeId: 'EMP-1003' },
    )

    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:smarthr-test')
    const revokeObjectUrlSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {})
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    renderAppAt('/')
    await signInViaUi('EMP-1004')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('link', { name: 'Open Reports & Analytics' }))

    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-employees').textContent).toBe('2')
    })

    expect(screen.getByTestId('report-scope-banner').textContent).toContain(
      'Team Scope (Engineering)',
    )
    expect(
      (screen.getByLabelText('Department') as HTMLSelectElement).disabled,
    ).toBe(true)

    const leaveTable = screen.getByRole('table', {
      name: 'Leave report requests',
    })
    expect(within(leaveTable).getByText('Jordan Taylor')).toBeTruthy()
    expect(within(leaveTable).queryByText('Marcus Chen')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Export Workforce CSV' }))
    await waitFor(() => {
      expect(
        screen.getByText(/Exported 2 employees rows to smarthr-employees-report-/i),
      ).toBeTruthy()
    })
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1)
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1)
  })

  it('supports HR organization filtering, empty states, active filter reset, and pagination', async () => {
    await employeeService.listDemoSignInProfiles()

    // Seed 15 attendance sessions across Engineering & Finance to exercise pagination (>10 rows)
    const attendanceRows: AttendanceRecord[] = []
    for (let i = 1; i <= 15; i += 1) {
      const day = String(i).padStart(2, '0')
      const isFinance = i <= 3
      attendanceRows.push({
        id: `att-ui-${i}`,
        employeeId: isFinance ? 'EMP-1003' : 'EMP-1001',
        employeeName: isFinance ? 'Marcus Chen' : 'Jordan Taylor',
        attendanceDate: `2026-10-${day}`,
        clockInAtUtc: `2026-10-${day}T01:00:00.000Z`,
        clockOutAtUtc: `2026-10-${day}T05:00:00.000Z`,
        durationMinutes: 240,
        status: 'Clocked Out',
        businessTimezone: 'Asia/Manila',
        createdAtUtc: `2026-10-${day}T01:00:00.000Z`,
        updatedAtUtc: `2026-10-${day}T05:00:00.000Z`,
      })
    }
    window.localStorage.setItem(
      DEMO_ATTENDANCE_STORAGE_KEY,
      JSON.stringify(attendanceRows),
    )

    renderAppAt('/')
    await signInViaUi('EMP-1002')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    })
    fireEvent.click(within(getMainNav()).getByText('Reports'))

    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-employees').textContent).toBe('5')
      expect(screen.getByTestId('kpi-total-sessions').textContent).toBe('15')
      expect(
        screen.getByText('Showing 1–10 of 15 (Page 1 of 2)'),
      ).toBeTruthy()
    })

    // Navigate to page 2
    fireEvent.click(
      screen.getByRole('button', { name: 'Next attendance page' }),
    )
    await waitFor(() => {
      expect(
        screen.getByText('Showing 11–15 of 15 (Page 2 of 2)'),
      ).toBeTruthy()
    })

    // Filter by Department = Finance -> automatically resets page back to Page 1 & narrows totals cleanly
    fireEvent.change(screen.getByLabelText('Department'), {
      target: { value: 'Finance' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-employees').textContent).toBe('1')
      expect(screen.getByTestId('kpi-total-sessions').textContent).toBe('3')
      expect(screen.getByLabelText('Active filters').textContent).toContain(
        'Department: Finance',
      )
    })

    // Filter to empty state (Sales has 0 employees & 0 records)
    fireEvent.change(screen.getByLabelText('Department'), {
      target: { value: 'Sales' },
    })
    await waitFor(() => {
      expect(
        screen.getByText('No matching employee directory records'),
      ).toBeTruthy()
      expect(screen.getByText('No matching attendance sessions')).toBeTruthy()
      expect(screen.getByText('No matching leave requests')).toBeTruthy()
    })

    // Reset filters restores all 5 employees & 15 attendance sessions
    fireEvent.click(screen.getByRole('button', { name: 'Reset Filters' }))
    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-employees').textContent).toBe('5')
      expect(screen.getByTestId('kpi-total-sessions').textContent).toBe('15')
    })

    // Invalid date range order surfaces inline validation alert
    fireEvent.change(screen.getByLabelText('Start Date'), {
      target: { value: '2026-10-20' },
    })
    fireEvent.change(screen.getByLabelText('End Date'), {
      target: { value: '2026-10-10' },
    })
    await waitFor(() => {
      expect(
        screen.getByText('Start date cannot be later than end date.'),
      ).toBeTruthy()
    })
  })

  it('displays error banner and recovers cleanly on Retry when report loading fails', async () => {
    const authSvc = createDemoAuthService({
      employeeService,
      storage: window.localStorage,
    })
    await employeeService.listDemoSignInProfiles()
    const signedInAdmin = await authSvc.signIn('EMP-1005')

    const baseService = createDemoReportService({
      employeeService,
      storage: window.localStorage,
    })
    let shouldFail = true
    const flakyService: typeof baseService = {
      ...baseService,
      async generateReport(filters, actor) {
        if (shouldFail) {
          throw new ReportServiceError(
            'PERSISTENCE_ERROR',
            'Temporary analytics service error.',
            500,
          )
        }
        return baseService.generateReport(filters, actor)
      },
    }

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <AuthProvider
          authService={authSvc}
          initialAuthState={{
            status: 'authenticated',
            user: signedInAdmin.user,
            session: signedInAdmin.session,
          }}
        >
          <Reports rptService={flakyService} />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Unable to generate HR report')).toBeTruthy()
      expect(screen.getByText('Temporary analytics service error.')).toBeTruthy()
    })

    shouldFail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(screen.getByTestId('kpi-total-employees').textContent).toBe('5')
    })
    expect(screen.queryByText('Unable to generate HR report')).toBeNull()
  })
})

