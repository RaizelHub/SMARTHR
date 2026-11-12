import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../../routes/AppRouter'
import { createDemoAttendanceService } from '../../attendance/services/attendanceService'
import {
  DEMO_EMPLOYEES_STORAGE_KEY,
  employeeService,
} from '../../employees/services/employeeService'
import { createDemoLeaveService } from '../../leave/services/leaveService'
import {
  createDemoAuthService,
  DEMO_AUTH_SESSION_KEY,
  type AuthService,
} from '../authService'

function renderAppAt(route: string, authService?: AuthService) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppRoutes authService={authService} />
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

function formatOffsetUtcDate(daysAhead: number): string {
  const now = new Date()
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead),
  )
  const y = target.getUTCFullYear()
  const m = String(target.getUTCMonth() + 1).padStart(2, '0')
  const d = String(target.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getMainNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Main navigation' })
}

describe('RBAC UI, Protected Routes, Scoping, and Security integration workflows', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('redirects unauthenticated users from protected routes to login without leaking protected data', async () => {
    for (const protectedPath of [
      '/dashboard',
      '/employees',
      '/employees/new',
      '/attendance',
      '/leave',
      '/roles',
    ]) {
      renderAppAt(protectedPath)
      await waitFor(() => {
        expect(screen.getByText('Sign In to Smart HR')).toBeTruthy()
      })
      expect(screen.queryByText('Jordan Taylor')).toBeNull()
      cleanup()
    }
  })

  it('redirects expired demo sessions to login with expiration warning', async () => {
    await employeeService.listDemoSignInProfiles()
    window.localStorage.setItem(
      DEMO_AUTH_SESSION_KEY,
      JSON.stringify({
        sessionId: 'sess-expired-1',
        employeeId: 'EMP-1005',
        issuedAtUtc: '2026-11-12T00:00:00.000Z',
        expiresAtUtc: '2026-11-12T01:00:00.000Z',
      }),
    )

    const authSvc = createDemoAuthService({
      employeeService,
      storage: window.localStorage,
      now: () => new Date('2026-11-12T02:00:00.000Z'),
    })

    renderAppAt('/roles', authSvc)

    await waitFor(() => {
      expect(screen.getByText('Sign In to Smart HR')).toBeTruthy()
      expect(
        screen.getByText(/Your previous demo session expired/i),
      ).toBeTruthy()
    })
    expect(screen.queryByText('Employee Role Assignments')).toBeNull()
  })

  it('blocks inactive employee accounts from signing in', async () => {
    await employeeService.createEmployee(
      {
        employeeId: 'EMP-2100',
        fullName: 'Inactive Account',
        workEmail: 'inactive.acct@smarthr.demo',
        department: 'Sales',
        position: 'Rep',
        employmentStatus: 'Inactive',
        hireDate: '2026-01-10',
        assignedRole: 'Employee',
      },
      { actorEmployeeId: 'EMP-1002' },
    )

    renderAppAt('/')
    await signInViaUi('EMP-2100')

    await waitFor(() => {
      expect(
        screen.getByText('Inactive employee accounts cannot sign in.'),
      ).toBeTruthy()
    })
  })

  it('enforces Employee role boundaries across navigation, Employees, Attendance, Leave, and /roles', async () => {
    const attService = createDemoAttendanceService({
      employeeService,
      storage: window.localStorage,
    })
    const lvService = createDemoLeaveService({
      employeeService,
      storage: window.localStorage,
    })

    // Seed coworker records that EMP-1001 must NEVER see
    await attService.clockIn(
      { employeeId: 'EMP-1003' },
      { actorEmployeeId: 'EMP-1003' },
    )
    const leaveDate = formatOffsetUtcDate(5)
    await lvService.submitLeaveRequest(
      {
        employeeId: 'EMP-1003',
        leaveType: 'Annual Leave',
        startDate: leaveDate,
        endDate: leaveDate,
      },
      { actorEmployeeId: 'EMP-1003' },
    )

    // Sign in as Jordan Taylor (EMP-1001 · Employee)
    renderAppAt('/')
    await signInViaUi('EMP-1001')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    })

    const initialNav = getMainNav()
    expect(within(initialNav).queryByText('Register Employee')).toBeNull()
    expect(within(initialNav).queryByText('Access Control')).toBeNull()
    expect(screen.queryByText('Manage Roles')).toBeNull()

    // Navigate to Employees -> scoped to self only; no registration/clear controls
    fireEvent.click(within(getMainNav()).getByText('Employees'))
    await waitFor(() => {
      expect(screen.getByText('EMP-1001')).toBeTruthy()
    })
    expect(screen.queryByText('Marcus Chen')).toBeNull()
    expect(screen.queryByText('Priya Nair')).toBeNull()
    expect(screen.queryByText('Register New Employee')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear All' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset Demo Data' })).toBeNull()

    // Attendance -> no demo impersonation dropdown, EMP-1003 hidden
    fireEvent.click(within(getMainNav()).getByText('Attendance'))
    await waitFor(() => {
      expect(screen.getByText('No attendance records recorded yet')).toBeTruthy()
    })
    expect(screen.queryByLabelText('Acting Demo Employee')).toBeNull()

    // Leave -> no review queue, EMP-1003 hidden
    fireEvent.click(within(getMainNav()).getByText('Leave'))
    await waitFor(() => {
      expect(screen.getByText('No leave requests submitted yet')).toBeTruthy()
    })
    expect(screen.queryByText('Manager & HR Leave Review Queue')).toBeNull()

    // Direct URL access to restricted routes renders 403 Access Denied
    cleanup()
    renderAppAt('/employees/new')
    await waitFor(() => {
      expect(screen.getByText('HTTP 403 · Access Denied')).toBeTruthy()
      expect(screen.getByText('Unauthorized Access')).toBeTruthy()
    })

    cleanup()
    renderAppAt('/roles')
    await waitFor(() => {
      expect(screen.getByText('HTTP 403 · Access Denied')).toBeTruthy()
    })
  })

  it('enforces Manager department scope on Employees, Attendance, Leave Review Queue, and blocks admin routes', async () => {
    const attService = createDemoAttendanceService({
      employeeService,
      storage: window.localStorage,
    })
    const lvService = createDemoLeaveService({
      employeeService,
      storage: window.localStorage,
    })

    // Engineering vs Finance attendance & leave
    await attService.clockIn(
      { employeeId: 'EMP-1001' },
      { actorEmployeeId: 'EMP-1001' },
    )
    await attService.clockIn(
      { employeeId: 'EMP-1003' },
      { actorEmployeeId: 'EMP-1003' },
    )

    const d1 = formatOffsetUtcDate(7)
    const d2 = formatOffsetUtcDate(9)
    const d3 = formatOffsetUtcDate(11)
    await lvService.submitLeaveRequest(
      {
        employeeId: 'EMP-1001',
        leaveType: 'Annual Leave',
        startDate: d1,
        endDate: d1,
      },
      { actorEmployeeId: 'EMP-1001' },
    )
    await lvService.submitLeaveRequest(
      {
        employeeId: 'EMP-1003',
        leaveType: 'Annual Leave',
        startDate: d2,
        endDate: d2,
      },
      { actorEmployeeId: 'EMP-1003' },
    )
    await lvService.submitLeaveRequest(
      {
        employeeId: 'EMP-1004',
        leaveType: 'Annual Leave',
        startDate: d3,
        endDate: d3,
      },
      { actorEmployeeId: 'EMP-1004' },
    )

    // Sign in as Dana Reyes (EMP-1004 · Engineering Manager)
    renderAppAt('/')
    await signInViaUi('EMP-1004')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    })

    const initialNav = getMainNav()
    expect(within(initialNav).queryByText('Register Employee')).toBeNull()
    expect(within(initialNav).queryByText('Access Control')).toBeNull()

    // Employees shows Engineering team only (EMP-1001 + EMP-1004), hides Marcus/Priya/Alex
    fireEvent.click(within(getMainNav()).getByText('Employees'))
    await waitFor(() => {
      expect(screen.getByText('Jordan Taylor')).toBeTruthy()
      expect(screen.getByText('Dana Reyes')).toBeTruthy()
    })
    expect(screen.queryByText('Marcus Chen')).toBeNull()
    expect(screen.queryByText('Priya Nair')).toBeNull()

    // Attendance shows Engineering attendance (EMP-1001), hides Finance (EMP-1003)
    fireEvent.click(within(getMainNav()).getByText('Attendance'))
    await waitFor(() => {
      expect(screen.getByText('EMP-1001')).toBeTruthy()
    })
    expect(screen.queryByText('EMP-1003')).toBeNull()

    // Leave Review Queue shows Engineering team & blocks self-approval
    fireEvent.click(within(getMainNav()).getByText('Leave'))
    await waitFor(() => {
      expect(screen.getByText('Manager & HR Leave Review Queue')).toBeTruthy()
      expect(screen.getByText('Jordan Taylor')).toBeTruthy()
    })
    expect(screen.queryByText('Marcus Chen')).toBeNull()
    const danaCard = screen.getByLabelText('Leave request from Dana Reyes')
    expect(within(danaCard).queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(
      within(danaCard).getByText(
        'Reviewers cannot approve or reject their own leave requests.',
      ),
    ).toBeTruthy()

    cleanup()
    renderAppAt('/roles')
    await waitFor(() => {
      expect(screen.getByText('HTTP 403 · Access Denied')).toBeTruthy()
    })
  })

  it('allows HR Coordinator employee registration without HR Admin privilege, and restricts /roles and deletes', async () => {
    renderAppAt('/')
    await signInViaUi('EMP-1002')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    })

    const initialNav = getMainNav()
    expect(within(initialNav).getByText('Register Employee')).toBeTruthy()
    expect(within(initialNav).queryByText('Access Control')).toBeNull()

    fireEvent.click(within(getMainNav()).getByText('Register Employee'))
    await waitFor(() => {
      expect(screen.getByText('Register New Employee')).toBeTruthy()
    })

    const roleSelect = screen.getByLabelText(/Assigned Role/i) as HTMLSelectElement
    const roleOptions = Array.from(roleSelect.options).map((o) => o.value)
    expect(roleOptions).not.toContain('HR Admin')
    expect(screen.queryByRole('button', { name: 'Clear All' })).toBeNull()

    cleanup()
    renderAppAt('/roles')
    await waitFor(() => {
      expect(screen.getByText('HTTP 403 · Access Denied')).toBeTruthy()
    })
  })

  it('allows HR Admin role updates, prevents demoting last admin, reflects stale permission revocation immediately, and handles Sign Out cleanly', async () => {
    renderAppAt('/')
    await signInViaUi('EMP-1005')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    })

    fireEvent.click(within(getMainNav()).getByText('Access Control'))

    await waitFor(() => {
      expect(screen.getByText('Employee Role Assignments')).toBeTruthy()
    })

    // Guardrail: cannot remove HR Admin from sole active HR Admin
    fireEvent.change(screen.getByLabelText('Role for EMP-1005'), {
      target: { value: 'Employee' },
    })
    const roleTable = screen.getByRole('table', {
      name: 'Employee role assignments',
    })
    const alexRow = within(roleTable).getByText('EMP-1005').closest('tr')!
    fireEvent.click(within(alexRow).getByRole('button', { name: 'Update Role' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          /Cannot remove HR Admin privileges from the last active administrator/i,
        ),
      ).toBeTruthy()
    })

    // Promote Priya (EMP-1002) to HR Admin so Alex can test role update + audit log
    fireEvent.change(screen.getByLabelText('Role for EMP-1002'), {
      target: { value: 'HR Admin' },
    })
    const priyaRow = within(roleTable).getByText('EMP-1002').closest('tr')!
    fireEvent.click(within(priyaRow).getByRole('button', { name: 'Update Role' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          /Updated Priya Nair \(EMP-1002\) from HR Coordinator to HR Admin/i,
        ),
      ).toBeTruthy()
    })
    expect(screen.getByText('ROLE_CHANGED')).toBeTruthy()

    // Stale permission revocation: demote signed-in EMP-1005 in storage directly (simulating another admin)
    const rawEmployees = JSON.parse(
      window.localStorage.getItem(DEMO_EMPLOYEES_STORAGE_KEY)!,
    ) as Array<{ employeeId: string; assignedRole: string }>
    const demotedList = rawEmployees.map((emp) =>
      emp.employeeId === 'EMP-1005' ? { ...emp, assignedRole: 'Employee' } : emp,
    )
    window.localStorage.setItem(
      DEMO_EMPLOYEES_STORAGE_KEY,
      JSON.stringify(demotedList),
    )

    // Navigating between routes refreshes session and immediately hides /roles nav & revokes access
    fireEvent.click(within(getMainNav()).getByText('Dashboard'))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    })
    await waitFor(() => {
      expect(within(getMainNav()).queryByText('Access Control')).toBeNull()
    })

    // Visiting /roles directly with active session now shows 403 Access Denied immediately
    cleanup()
    renderAppAt('/roles')
    await waitFor(() => {
      expect(screen.getByText('HTTP 403 · Access Denied')).toBeTruthy()
    })

    // Re-test Sign Out clearing session completely
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }))
    await waitFor(() => {
      expect(screen.getByText('Sign In to Smart HR')).toBeTruthy()
    })
    expect(window.localStorage.getItem(DEMO_AUTH_SESSION_KEY)).toBeNull()

    // Attempting protected route after Sign Out redirects back to Sign In
    cleanup()
    renderAppAt('/dashboard')
    await waitFor(() => {
      expect(screen.getByText('Sign In to Smart HR')).toBeTruthy()
    })
  })
})

