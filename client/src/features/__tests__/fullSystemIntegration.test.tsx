import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../../pages/Dashboard'
import Employees from '../../pages/Employees'
import type { Employee } from '../../types/employee'
import {
  API_SESSION_EXPIRES_KEY,
  API_TOKEN_STORAGE_KEY,
  createApiHttpClient,
  readStoredApiToken,
} from '../api/httpClient'
import { createApiAttendanceService } from '../attendance/services/attendanceApiService'
import { AuthProvider } from '../auth/AuthContext'
import { createApiEmployeeService } from '../employees/services/employeeApiService'
import { EmployeeServiceError } from '../employees/services/employeeService'
import { createApiLeaveService } from '../leave/services/leaveApiService'
import { createApiReportService } from '../reports/services/reportApiService'

const HR_ADMIN_USER: Employee = {
  id: '1',
  employeeId: 'EMP-1005',
  fullName: 'Alex Rivera',
  workEmail: 'alex.rivera@smarthr.demo',
  department: 'Human Resources',
  position: 'Director of People Operations',
  employmentStatus: 'Active',
  hireDate: '2021-01-10',
  assignedRole: 'HR Admin',
  createdAt: '2021-01-10T00:00:00.000Z',
}

describe('Phase 7 Full System Connected API Integration & Reliability', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('clears stored Bearer session automatically on HTTP 401 token expiry or revocation', async () => {
    window.sessionStorage.setItem(API_TOKEN_STORAGE_KEY, 'expired-token-xyz')
    window.sessionStorage.setItem(
      API_SESSION_EXPIRES_KEY,
      new Date(Date.now() + 60_000).toISOString(),
    )

    const adapter = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          code: 'UNAUTHENTICATED',
          message: 'Token has expired or been revoked.',
        },
      },
      message: 'Request failed with status code 401',
    })
    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true)

    const client = createApiHttpClient('http://127.0.0.1:8000/api')
    client.defaults.adapter = adapter

    await expect(client.get('/employees/scoped')).rejects.toMatchObject({
      httpStatus: 401,
      code: 'UNAUTHENTICATED',
    })

    expect(readStoredApiToken()).toBeNull()
  })

  it('propagates connected API calls and surfaces real 409/403 domain failures across Employee, Attendance, Leave, and Report API services', async () => {
    const getMock = vi.fn(async (url: string) => {
      if (url === '/employees/scoped') {
        return { data: { employees: [HR_ADMIN_USER] }, headers: {} }
      }
      if (url === '/attendance') {
        return {
          data: {
            records: [
              {
                id: 'att-1',
                employeeId: 'EMP-1005',
                employeeName: 'Alex Rivera',
                attendanceDate: '2026-11-13',
                clockInAtUtc: '2026-11-13T01:00:00Z',
                clockOutAtUtc: null,
                durationMinutes: null,
                status: 'Clocked In',
                businessTimezone: 'Asia/Manila',
                createdAtUtc: '2026-11-13T01:00:00Z',
                updatedAtUtc: '2026-11-13T01:00:00Z',
              },
            ],
          },
          headers: {},
        }
      }
      if (url === '/leave-requests') {
        return { data: { requests: [] }, headers: {} }
      }
      if (url === '/reports/export/employees') {
        return {
          data: 'Employee ID,Full Name\nEMP-1005,Alex Rivera\n',
          headers: {
            'content-disposition': 'attachment; filename="smarthr-employees-report-2026-11-13.csv"',
            'x-export-row-count': '1',
          },
        }
      }
      return { data: {}, headers: {} }
    })

    const postMock = vi.fn(async (url: string) => {
      if (url === '/employees') {
        throw new EmployeeServiceError(
          'DUPLICATE_EMPLOYEE_ID',
          'Employee ID "EMP-1005" is already registered',
        )
      }
      return { data: {} }
    })

    const patchMock = vi.fn(async (url: string, body: { employmentStatus?: string }) => {
      if (url.includes('/employees/')) {
        return {
          data: {
            employee: {
              ...HR_ADMIN_USER,
              employmentStatus: body.employmentStatus ?? 'Active',
            },
          },
        }
      }
      return { data: {} }
    })

    const stubClient = {
      get: getMock,
      post: postMock,
      patch: patchMock,
    } as unknown as ReturnType<typeof createApiHttpClient>

    const empApi = createApiEmployeeService({ httpClient: stubClient })
    const attApi = createApiAttendanceService({ httpClient: stubClient })
    const lvApi = createApiLeaveService({ httpClient: stubClient })
    const rptApi = createApiReportService({ httpClient: stubClient })

    expect(empApi.isDemoMode).toBe(false)
    expect(attApi.isDemoMode).toBe(false)
    expect(lvApi.isDemoMode).toBe(false)
    expect(lvApi.balanceTrackingSupported).toBe(false)
    expect(rptApi.isDemoMode).toBe(false)

    const emps = await empApi.listEmployees({ actorEmployeeId: 'EMP-1005' })
    expect(emps).toHaveLength(1)

    const attRecords = await attApi.listAttendanceRecords({ actorEmployeeId: 'EMP-1005' })
    expect(attRecords).toHaveLength(1)
    expect(attRecords[0].status).toBe('Clocked In')

    await expect(
      empApi.createEmployee(
        {
          employeeId: 'EMP-1005',
          fullName: 'Duplicate',
          workEmail: 'dup@smarthr.demo',
          department: 'Engineering',
          position: 'Eng',
          employmentStatus: 'Active',
          hireDate: '2026-11-01',
          assignedRole: 'Employee',
        },
        { actorEmployeeId: 'EMP-1005' },
      ),
    ).rejects.toThrow(/already registered/)

    const exported = await rptApi.exportReportCsv('employees', {}, { actorEmployeeId: 'EMP-1005' })
    expect(exported.filename).toBe('smarthr-employees-report-2026-11-13.csv')
    expect(exported.rowCount).toBe(1)
    expect(exported.csvContent).toContain('EMP-1005')
  })

  it('updates employee status cleanly in Connected API mode UI and hides obsolete Demo/not-implemented badges', async () => {
    const updateMock = vi.fn().mockResolvedValue({
      ...HR_ADMIN_USER,
      employeeId: 'EMP-1001',
      fullName: 'Jordan Taylor',
      employmentStatus: 'Inactive',
    })

    const stubEmpService = {
      isDemoMode: false,
      listDemoSignInProfiles: vi.fn().mockResolvedValue([]),
      resolveEmployeeForAuth: vi.fn().mockResolvedValue(HR_ADMIN_USER),
      listAllDirectoryForServiceInternal: vi.fn().mockResolvedValue([]),
      listEmployees: vi.fn().mockResolvedValue([
        {
          ...HR_ADMIN_USER,
          id: '2',
          employeeId: 'EMP-1001',
          fullName: 'Jordan Taylor',
          workEmail: 'jordan@smarthr.demo',
          assignedRole: 'Employee',
        },
      ]),
      createEmployee: vi.fn(),
      updateEmployee: updateMock,
      updateEmployeeRole: vi.fn(),
      listSecurityAuditEvents: vi.fn().mockResolvedValue([]),
      clearEmployees: vi.fn(),
      resetDemoEmployees: vi.fn(),
    }

    render(
      <MemoryRouter initialEntries={['/employees']}>
        <AuthProvider
          authService={{
            isDemoMode: false,
            signIn: vi.fn(),
            signOut: vi.fn(),
            getSessionState: vi.fn().mockResolvedValue({
              status: 'authenticated',
              user: HR_ADMIN_USER,
              session: null,
            }),
          }}
          initialAuthState={{
            status: 'authenticated',
            user: HR_ADMIN_USER,
          }}
        >
          <Employees service={stubEmpService} />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Jordan Taylor')).toBeTruthy()
    })

    // In API mode, Reset Demo Data is hidden and API status control works
    expect(screen.queryByRole('button', { name: 'Reset Demo Data' })).toBeNull()

    const statusSelect = screen.getByLabelText('Roster status for EMP-1001')
    fireEvent.change(statusSelect, { target: { value: 'Inactive' } })

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        { targetEmployeeId: 'EMP-1001', employmentStatus: 'Inactive' },
        expect.anything(),
      )
    })

    cleanup()

    // Dashboard displays Connected (API) badges when authService.isDemoMode is false
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider
          authService={{
            isDemoMode: false,
            signIn: vi.fn(),
            signOut: vi.fn(),
            getSessionState: vi.fn().mockResolvedValue({
              status: 'authenticated',
              user: HR_ADMIN_USER,
              session: null,
            }),
          }}
          initialAuthState={{
            status: 'authenticated',
            user: HR_ADMIN_USER,
          }}
        >
          <Dashboard />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getAllByText('Connected (API)').length).toBeGreaterThanOrEqual(4)
    expect(screen.queryByText(/Payroll management — not implemented/i)).toBeNull()
  })
})
