import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Employees from '../../../pages/Employees'
import type { Employee } from '../../../types/employee'
import { AuthProvider } from '../../auth/AuthContext'
import {
  createDemoEmployeeService,
  DEMO_EMPLOYEES_STORAGE_KEY,
  EmployeeServiceError,
  SYNTHETIC_DEMO_EMPLOYEES,
  type EmployeeService,
} from '../services/employeeService'

const HR_COORDINATOR_USER = SYNTHETIC_DEMO_EMPLOYEES.find(
  (emp) => emp.employeeId === 'EMP-1002',
)!
const HR_ADMIN_USER = SYNTHETIC_DEMO_EMPLOYEES.find(
  (emp) => emp.employeeId === 'EMP-1005',
)!

function renderEmployeesPage(
  service?: EmployeeService,
  actingUser: Employee = HR_COORDINATOR_USER,
) {
  return render(
    <MemoryRouter initialEntries={['/employees']}>
      <AuthProvider
        initialAuthState={{
          status: 'authenticated',
          user: actingUser,
        }}
      >
        <Employees service={service} />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function createStubEmployeeService(
  overrides: Partial<EmployeeService>,
): EmployeeService {
  return {
    isDemoMode: true,
    listDemoSignInProfiles: vi.fn().mockResolvedValue([]),
    resolveEmployeeForAuth: vi.fn().mockResolvedValue(null),
    listAllDirectoryForServiceInternal: vi.fn().mockResolvedValue([]),
    listEmployees: vi.fn().mockResolvedValue([]),
    createEmployee: vi.fn(),
    updateEmployeeRole: vi.fn(),
    listSecurityAuditEvents: vi.fn().mockResolvedValue([]),
    clearEmployees: vi.fn().mockResolvedValue([]),
    resetDemoEmployees: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function fillValidRegistrationForm(overrides?: {
  employeeId?: string
  fullName?: string
  workEmail?: string
  hireDate?: string
  department?: string
  position?: string
  employmentStatus?: string
  assignedRole?: string
}) {
  fireEvent.change(screen.getByLabelText(/Employee ID/i), {
    target: { value: overrides?.employeeId ?? 'EMP-3001' },
  })
  fireEvent.change(screen.getByLabelText(/Full Name/i), {
    target: { value: overrides?.fullName ?? 'Samira Patel' },
  })
  fireEvent.change(screen.getByLabelText(/Work Email/i), {
    target: { value: overrides?.workEmail ?? 'samira.patel@smarthr.demo' },
  })
  fireEvent.change(screen.getByLabelText(/Hire Date/i), {
    target: { value: overrides?.hireDate ?? '2026-10-12' },
  })
  fireEvent.change(screen.getByLabelText(/Department/i), {
    target: { value: overrides?.department ?? 'Engineering' },
  })
  fireEvent.change(screen.getByLabelText(/Position/i), {
    target: { value: overrides?.position ?? 'Platform Engineer' },
  })
  fireEvent.change(screen.getByLabelText(/Employment Status/i), {
    target: { value: overrides?.employmentStatus ?? 'Active' },
  })
  fireEvent.change(screen.getByLabelText(/Assigned Role/i), {
    target: { value: overrides?.assignedRole ?? 'Employee' },
  })
}

describe('Employee Creation and Registration integration workflow', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('displays synthetic demo employee records accurately on load', async () => {
    const service = createDemoEmployeeService(window.localStorage)
    renderEmployeesPage(service)

    await waitFor(() => {
      expect(screen.getByText('Jordan Taylor')).toBeTruthy()
    })

    expect(screen.getByText('EMP-1001')).toBeTruthy()
    expect(screen.getByText('jordan.taylor@smarthr.demo')).toBeTruthy()
    expect(screen.getByText('Priya Nair')).toBeTruthy()
    expect(screen.getByText('Marcus Chen')).toBeTruthy()
  })

  it('accepts valid employee data, confirms success, and displays the persisted record', async () => {
    const service = createDemoEmployeeService(window.localStorage)
    renderEmployeesPage(service)

    await waitFor(() => {
      expect(screen.getByText('Jordan Taylor')).toBeTruthy()
    })

    fillValidRegistrationForm()
    fireEvent.click(screen.getByRole('button', { name: 'Register Employee' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          /Registered Samira Patel \(EMP-3001\) successfully\./i,
        ),
      ).toBeTruthy()
    })

    expect(screen.getByText('EMP-3001')).toBeTruthy()
    expect(screen.getByText('Samira Patel')).toBeTruthy()
    expect(screen.getByText('samira.patel@smarthr.demo')).toBeTruthy()
    expect(screen.getByText('Platform Engineer')).toBeTruthy()

    const persistedRaw = window.localStorage.getItem(DEMO_EMPLOYEES_STORAGE_KEY)
    expect(persistedRaw).toContain('EMP-3001')
    expect((screen.getByLabelText(/Employee ID/i) as HTMLInputElement).value).toBe('')
  })

  it('rejects missing required fields and displays accessible validation messages', async () => {
    const service = createDemoEmployeeService(window.localStorage)
    const createSpy = vi.spyOn(service, 'createEmployee')
    renderEmployeesPage(service)

    await waitFor(() => {
      expect(screen.getByText('Jordan Taylor')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Register Employee' }))

    await waitFor(() => {
      expect(screen.getByText('Employee ID is required')).toBeTruthy()
    })

    expect(screen.getByText('Full name is required')).toBeTruthy()
    expect(screen.getByText('Work email is required')).toBeTruthy()
    expect(screen.getByText('Hire date is required')).toBeTruthy()
    expect(screen.getByText('Department is required')).toBeTruthy()
    expect(screen.getByText('Position is required')).toBeTruthy()
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('rejects invalid email addresses', async () => {
    const service = createDemoEmployeeService(window.localStorage)
    const createSpy = vi.spyOn(service, 'createEmployee')
    renderEmployeesPage(service)

    await waitFor(() => {
      expect(screen.getByText('Jordan Taylor')).toBeTruthy()
    })

    fillValidRegistrationForm({ workEmail: 'invalid-email' })
    fireEvent.click(screen.getByRole('button', { name: 'Register Employee' }))

    await waitFor(() => {
      expect(screen.getByText('Enter a valid work email address')).toBeTruthy()
    })

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('prevents duplicate employee IDs case-insensitively and preserves user input', async () => {
    const service = createDemoEmployeeService(window.localStorage)
    renderEmployeesPage(service)

    await waitFor(() => {
      expect(screen.getByText('EMP-1001')).toBeTruthy()
    })

    fillValidRegistrationForm({
      employeeId: 'emp-1001',
      fullName: 'Duplicate Test',
      workEmail: 'unique.person@smarthr.demo',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Register Employee' }))

    await waitFor(() => {
      expect(
        screen.getByText(/Employee ID "emp-1001" is already registered/i),
      ).toBeTruthy()
    })

    expect((screen.getByLabelText(/Full Name/i) as HTMLInputElement).value).toBe(
      'Duplicate Test',
    )
  })

  it('displays an appropriate error when a persistence or API-style request fails', async () => {
    const failingService = createStubEmployeeService({
      listEmployees: async () => [],
      createEmployee: async () => {
        throw new EmployeeServiceError(
          'PERSISTENCE_ERROR',
          'Simulated storage write failure.',
        )
      },
    })

    renderEmployeesPage(failingService)

    await waitFor(() => {
      expect(screen.getByText('No employees registered yet')).toBeTruthy()
    })

    fillValidRegistrationForm()
    fireEvent.click(screen.getByRole('button', { name: 'Register Employee' }))

    await waitFor(() => {
      expect(screen.getByText('Unable to register employee')).toBeTruthy()
      expect(screen.getByText('Simulated storage write failure.')).toBeTruthy()
    })

    expect((screen.getByLabelText(/Employee ID/i) as HTMLInputElement).value).toBe(
      'EMP-3001',
    )
  })

  it('displays an error and allows retry when loading employee records fails', async () => {
    const loadOnceFailingService = createStubEmployeeService({
      listEmployees: vi
        .fn()
        .mockRejectedValueOnce(new Error('Storage read failed'))
        .mockResolvedValueOnce([]),
    })

    renderEmployeesPage(loadOnceFailingService)

    await waitFor(() => {
      expect(screen.getByText('Unable to load employee records')).toBeTruthy()
      expect(screen.getByText('Storage read failed')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(screen.getByText('No employees registered yet')).toBeTruthy()
    })
  })

  it('shows empty state after clearing all records and restores samples on reset for HR Admin', async () => {
    const service = createDemoEmployeeService(window.localStorage)
    renderEmployeesPage(service, HR_ADMIN_USER)

    await waitFor(() => {
      expect(screen.getByText('Jordan Taylor')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }))

    await waitFor(() => {
      expect(screen.getByText('No employees registered yet')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset Demo Data' }))

    await waitFor(() => {
      expect(screen.getByText('Jordan Taylor')).toBeTruthy()
    })
  })
})
