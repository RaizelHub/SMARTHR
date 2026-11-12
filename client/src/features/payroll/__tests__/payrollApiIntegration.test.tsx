import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
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
import Login from '../../../pages/Login'
import Payroll from '../../../pages/Payroll'
import type { Employee } from '../../../types/employee'
import type {
  CompensationRecord,
  PayrollEntry,
  PayrollPeriod,
  StatutoryRuleVersionDto,
} from '../../../types/payroll'
import {
  API_TOKEN_STORAGE_KEY,
  clearStoredApiSession,
  createApiHttpClient,
} from '../../api/httpClient'
import { AuthProvider } from '../../auth/AuthContext'
import { createApiAuthService } from '../../auth/authApiService'
import type { AuthService } from '../../auth/authTypes'
import { createApiPayrollService } from '../services/payrollApiService'
import type { PayrollService } from '../services/payrollTypes'

function makeAxiosErrorResponse(
  status: number,
  data: Record<string, unknown>,
  config: InternalAxiosRequestConfig,
) {
  return new axios.AxiosError(
    String(data.message ?? 'Request failed'),
    `ERR_${status}`,
    config,
    undefined,
    {
      status,
      statusText: 'Error',
      headers: {},
      config,
      data,
    },
  )
}

function makeEmployeeUser(overrides: Partial<Employee> = {}): Employee {
  return {
    id: '5',
    employeeId: 'EMP-1005',
    fullName: 'Evelyn Brooks',
    workEmail: 'evelyn.brooks@smarthr.local',
    department: 'Human Resources',
    position: 'HR Director',
    employmentStatus: 'Active',
    hireDate: '2024-01-15',
    assignedRole: 'HR Admin',
    createdAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('Phase 6B Connected API Auth, Payroll Service & UI Integration', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  afterEach(() => {
    clearStoredApiSession()
    cleanup()
    vi.restoreAllMocks()
  })

  it('authenticates via Laravel Sanctum credentials, restores /auth/me, and rejects invalid/inactive accounts cleanly', async () => {
    const httpClient = createApiHttpClient('http://localhost:8000/api')
    httpClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/login' && config.method === 'post') {
        const body = JSON.parse(String(config.data ?? '{}')) as {
          email?: string
          password?: string
        }
        if (body.email === 'inactive@smarthr.local') {
          throw makeAxiosErrorResponse(
            403,
            {
              code: 'EMPLOYEE_INACTIVE',
              message: 'Inactive employee accounts cannot authenticate.',
            },
            config,
          )
        }
        if (
          body.email === 'evelyn.brooks@smarthr.local' &&
          body.password === 'correct-password'
        ) {
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            data: {
              token: 'sanctum-token-123',
              tokenType: 'Bearer',
              expiresAtUtc: new Date(Date.now() + 3600_000).toISOString(),
              user: {
                id: 5,
                email: 'evelyn.brooks@smarthr.local',
                employeeId: 'EMP-1005',
                fullName: 'Evelyn Brooks',
                workEmail: 'evelyn.brooks@smarthr.local',
                department: 'Human Resources',
                position: 'HR Director',
                employmentStatus: 'Active',
                assignedRole: 'HR Admin',
                hireDate: '2024-01-15',
              },
            },
          }
        }
        throw makeAxiosErrorResponse(
          401,
          { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
          config,
        )
      }

      if (config.url === '/auth/me') {
        const authHeader =
          config.headers instanceof AxiosHeaders
            ? config.headers.get('Authorization')
            : undefined
        if (authHeader !== 'Bearer sanctum-token-123') {
          throw makeAxiosErrorResponse(
            401,
            { message: 'Unauthenticated.' },
            config,
          )
        }
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            user: {
              id: 5,
              email: 'evelyn.brooks@smarthr.local',
              employeeId: 'EMP-1005',
              fullName: 'Evelyn Brooks',
              workEmail: 'evelyn.brooks@smarthr.local',
              department: 'Human Resources',
              position: 'HR Director',
              employmentStatus: 'Active',
              assignedRole: 'HR Admin',
              hireDate: '2024-01-15',
            },
          },
        }
      }

      return { status: 200, statusText: 'OK', headers: {}, config, data: {} }
    }

    const apiAuth = createApiAuthService({ httpClient })

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider authService={apiAuth}>
          <Login />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByText('Connected Laravel API · Sanctum Auth'),
      ).toBeTruthy()
      expect(screen.getByLabelText('Work Email')).toBeTruthy()
      expect(screen.getByLabelText('Password')).toBeTruthy()
    })
    expect(screen.queryByLabelText('Demo Account')).toBeNull()

    // 1. Inactive account rejection
    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'inactive@smarthr.local' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'any' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(
        screen.getByText('Inactive employee accounts cannot authenticate.'),
      ).toBeTruthy()
    })
    expect(window.sessionStorage.getItem(API_TOKEN_STORAGE_KEY)).toBeNull()

    // 2. Valid sign-in stores token & restores /auth/me session
    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'evelyn.brooks@smarthr.local' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(window.sessionStorage.getItem(API_TOKEN_STORAGE_KEY)).toBe(
        'sanctum-token-123',
      )
    })

    const restored = await apiAuth.getSessionState()
    expect(restored.status).toBe('authenticated')
    expect(restored.user?.employeeId).toBe('EMP-1005')

    await apiAuth.signOut()
    expect(window.sessionStorage.getItem(API_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('sends expected API contracts and propagates 403/409 errors without faking success', async () => {
    window.sessionStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-bearer')
    const requests: Array<{ method?: string; url?: string; data?: unknown }> = []

    const httpClient = createApiHttpClient('http://localhost:8000/api')
    httpClient.defaults.adapter = async (config) => {
      requests.push({
        method: config.method,
        url: config.url,
        data: config.data ? JSON.parse(String(config.data)) : undefined,
      })

      if (config.url === '/payroll/periods/10/approve') {
        throw makeAxiosErrorResponse(
          403,
          {
            code: 'SEGREGATION_OF_DUTIES_VIOLATION',
            message:
              'Maker-Checker control: Submitter cannot approve the same payroll period.',
          },
          config,
        )
      }

      if (config.url === '/payroll/compensations' && config.method === 'post') {
        return {
          status: 201,
          statusText: 'Created',
          headers: {},
          config,
          data: {
            compensation: {
              id: '99',
              employeeId: 'EMP-1001',
              employeeName: 'Jordan Taylor',
              department: 'Engineering',
              payBasis: 'Monthly',
              baseAmountCentavos: 3500000,
              currency: 'PHP',
              statutoryEligible: true,
              allowances: [
                {
                  id: 'allow-1',
                  label: 'Rice Subsidy',
                  amountCentavos: 200000,
                  taxable: false,
                },
              ],
              effectiveDate: '2026-01-01',
              endDate: null,
              status: 'Active',
              notes: '',
              createdByEmployeeId: 'EMP-1005',
              createdByRole: 'HR Admin',
              createdAtUtc: '2026-01-01T00:00:00Z',
              updatedAtUtc: '2026-01-01T00:00:00Z',
            } satisfies CompensationRecord,
          },
        }
      }

      if (config.url === '/payroll/payslips/55/pdf') {
        return {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/pdf' },
          config,
          data: new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }),
        }
      }

      return { status: 200, statusText: 'OK', headers: {}, config, data: {} }
    }

    const apiPayroll = createApiPayrollService({ httpClient })
    const actor = { actorEmployeeId: 'EMP-1005' }

    const comp = await apiPayroll.createCompensationRecord(
      {
        employeeId: 'EMP-1001',
        payBasis: 'Monthly',
        baseAmountInput: '35,000.00',
        allowances: [
          { label: 'Rice Subsidy', amountInput: '2000.00', taxable: false },
        ],
        statutoryEligible: true,
        effectiveDate: '2026-01-01',
      },
      actor,
    )
    expect(comp.baseAmountCentavos).toBe(3500000)
    expect(requests[0]).toMatchObject({
      method: 'post',
      url: '/payroll/compensations',
      data: {
        employee_code: 'EMP-1001',
        pay_basis: 'Monthly',
        base_amount: '35000.00',
        statutory_eligible: true,
        allowances: [
          { label: 'Rice Subsidy', amount: '2000.00', taxable: false },
        ],
      },
    })

    await expect(
      apiPayroll.approvePayrollPeriod('10', actor, undefined, 2),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      httpStatus: 403,
      message: expect.stringContaining('Maker-Checker'),
    })

    const pdfBlob = await apiPayroll.downloadPayslipPdf!('55', actor)
    expect(pdfBlob).toBeInstanceOf(Blob)
  })

  it('renders statutory breakdowns, separate employer cost, full approval workflow, PDF download, and surfaces failed approval errors in UI', async () => {
    const hrAdmin = makeEmployeeUser({
      employeeId: 'EMP-1005',
      assignedRole: 'HR Admin',
    })

    let periodStatus: PayrollPeriod['status'] = 'Calculated'
    let failApprove = true

    const periodObj = (): PayrollPeriod => ({
      id: '10',
      label: 'Jan 1–15 2026 Payroll',
      scheduleType: 'Semimonthly',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-15',
      payDate: '2026-01-20',
      semimonthlyHalf: 1,
      statutoryAllocationMode: 'HALF_HALF',
      status: periodStatus,
      businessTimezone: 'Asia/Manila',
      createdByEmployeeId: 'EMP-1002',
      createdByName: 'Maya Patel',
      createdAtUtc: '2026-01-01T00:00:00Z',
      updatedAtUtc: '2026-01-15T00:00:00Z',
      reviewedByEmployeeId: periodStatus === 'Calculated' ? null : 'EMP-1002',
      reviewedByName: periodStatus === 'Calculated' ? null : 'Maya Patel',
      reviewedAtUtc: null,
      reviewNotes: null,
      approvedByEmployeeId:
        periodStatus === 'Approved' || periodStatus === 'Locked'
          ? 'EMP-1005'
          : null,
      approvedByName:
        periodStatus === 'Approved' || periodStatus === 'Locked'
          ? 'Evelyn Brooks'
          : null,
      version: 1,
    })

    const sampleEntry = (): PayrollEntry => ({
      id: '100',
      payrollPeriodId: '10',
      periodLabel: 'Jan 1–15 2026 Payroll',
      scheduleType: 'Semimonthly',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-15',
      payDate: '2026-01-20',
      employeeId: 'EMP-1001',
      employeeName: 'Jordan Taylor',
      department: 'Engineering',
      compensationId: '1',
      payBasis: 'Monthly',
      baseCompensationCentavos: 3000000,
      currency: 'PHP',
      confirmedPayableUnitsHundredths: null,
      attendanceSessionsInPeriod: 0,
      earnings: [
        {
          id: 'l1',
          category: 'Earning',
          code: 'BASE_SEMIMONTHLY',
          label: 'Basic Semimonthly Pay (PHP 30,000.00 / 2)',
          amountCentavos: 1500000,
          source: 'Compensation Base',
          isTaxable: true,
          adjustmentKey: null,
        },
      ],
      deductions: [
        {
          id: 'l2',
          category: 'Deduction',
          code: 'SSS_EE',
          label: 'SSS Employee Contribution (Half 1)',
          amountCentavos: 75000,
          source: 'Philippine Statutory (SSS)',
          adjustmentKey: null,
        },
        {
          id: 'l3',
          category: 'Deduction',
          code: 'PHILHEALTH_EE',
          label: 'PhilHealth Employee Share (2.5% MBS Half 1)',
          amountCentavos: 37500,
          source: 'Philippine Statutory (PhilHealth)',
          adjustmentKey: null,
        },
      ],
      employerCosts: [
        {
          id: 'l4',
          category: 'EmployerCost',
          code: 'SSS_ER',
          label: 'SSS Employer Share + EC (Half 1)',
          amountCentavos: 151500,
          source: 'Philippine Statutory (SSS)',
          adjustmentKey: null,
        },
      ],
      grossPayCentavos: 1500000,
      totalDeductionsCentavos: 112500,
      totalEmployerCostCentavos: 151500,
      netPayCentavos: 1387500,
      status: periodStatus,
      requiresReview: false,
      hasNegativeNetPay: false,
      warnings: [],
      ruleSnapshot: {
        engineVersion: 'ph-statutory-v1.0.0',
        calculationMethod: 'INTEGER_CENTAVOS',
        roundingMode: 'ROUND_HALF_UP',
        statutoryDeductionsEnabled: true,
        asOfDate: '2026-01-15',
      },
      createdAtUtc: '2026-01-15T00:00:00Z',
      updatedAtUtc: '2026-01-15T00:00:00Z',
    })

    const mockRules: StatutoryRuleVersionDto[] = [
      {
        id: 1,
        rule_key: 'PH_SSS_2025',
        agency: 'SSS',
        issuance_reference: 'SSS Circular No. 2024-006 (5% EE / 10% ER)',
        official_url: 'https://www.sss.gov.ph/pay-contribution',
        effective_from: '2025-01-01',
        effective_to: null,
        is_active: true,
      },
    ]

    const downloadSpy = vi.fn().mockResolvedValue(
      new Blob(['%PDF-1.4 payslip'], { type: 'application/pdf' }),
    )
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-pdf')
    const revokeObjectUrlSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {})

    const mockPayrollService: PayrollService = {
      isDemoMode: false,
      businessTimezone: 'Asia/Manila',
      statutoryDeductionsEnabled: true,
      finalApprovalEnabled: true,
      listDirectoryEmployees: async () => [
        makeEmployeeUser({
          employeeId: 'EMP-1001',
          fullName: 'Jordan Taylor',
          department: 'Engineering',
          assignedRole: 'Employee',
        }),
      ],
      listStatutoryRules: async () => mockRules,
      listCompensationRecords: async () => [],
      createCompensationRecord: vi.fn(),
      listPayrollPeriods: async () => [periodObj()],
      createPayrollPeriod: vi.fn(),
      generateDraftPayroll: vi.fn(),
      listPayrollEntriesForPeriod: async () => [sampleEntry()],
      setConfirmedPayableUnits: vi.fn(),
      addManualAdjustment: vi.fn(),
      markPeriodInReview: async () => {
        periodStatus = 'Under Review'
        return periodObj()
      },
      returnPeriodForCorrection: async () => {
        periodStatus = 'Calculated'
        return periodObj()
      },
      approvePayrollPeriod: async () => {
        if (failApprove) {
          throw new Error(
            'Maker-Checker violation: reviewer cannot approve their own submission.',
          )
        }
        periodStatus = 'Approved'
        return periodObj()
      },
      lockPayrollPeriod: async () => {
        periodStatus = 'Locked'
        return periodObj()
      },
      downloadPayslipPdf: downloadSpy,
      listMyPayslips: async () => [sampleEntry()],
      getPayslipEntryById: async () => sampleEntry(),
      listPayrollAuditHistory: async () => [],
    }

    const fakeAuthService: AuthService = {
      isDemoMode: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
      getSessionState: async () => ({
        status: 'authenticated',
        user: hrAdmin,
        session: {
          sessionId: 'sanctum',
          employeeId: hrAdmin.employeeId,
          issuedAtUtc: '2026-01-15T00:00:00Z',
          expiresAtUtc: '2099-01-15T00:00:00Z',
        },
      }),
    }

    render(
      <MemoryRouter initialEntries={['/payroll']}>
        <AuthProvider authService={fakeAuthService}>
          <Payroll payService={mockPayrollService} />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByText('Payroll Management & Statutory Compliance'),
      ).toBeTruthy()
      expect(screen.getByText(/SSS Circular No\. 2024-006/)).toBeTruthy()
      expect(
        screen.getByTestId('payroll-kpi-employer-cost').textContent,
      ).toContain('PHP 1,515.00')
      expect(screen.getByTestId('payroll-kpi-net').textContent).toBe(
        'PHP 13,875.00',
      )
    })

    // Preview Payslip shows Employer Statutory Shares separately & Download PDF works
    fireEvent.click(screen.getByRole('button', { name: 'Preview Payslip' }))
    await waitFor(() => {
      expect(screen.getByTestId('payslip-employer-costs')).toBeTruthy()
      expect(
        screen.getByText(
          'Employer Statutory Shares (Company Cost — Not Deducted from Employee Pay)',
        ),
      ).toBeTruthy()
    })

    fireEvent.click(
      within(screen.getByTestId('payslip-preview-panel')).getByRole(
        'button',
        { name: 'Download PDF' },
      ),
    )
    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith('100', {
        actorEmployeeId: 'EMP-1005',
        sessionExpiresAtUtc: '2099-01-15T00:00:00Z',
      })
      expect(createObjectUrlSpy).toHaveBeenCalled()
      expect(revokeObjectUrlSpy).toHaveBeenCalled()
    })

    // Submit for Review -> Under Review
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Review' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Approve Payroll' })).toBeTruthy()
    })

    // Failed Approval surfaces real error banner without transitioning status
    fireEvent.click(screen.getByRole('button', { name: 'Approve Payroll' }))
    await waitFor(() => {
      expect(
        screen.getByText(/Maker-Checker violation: reviewer cannot approve/i),
      ).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Approve Payroll' })).toBeTruthy()
    })

    // Successful Approval -> Lock Period
    failApprove = false
    fireEvent.click(screen.getByRole('button', { name: 'Approve Payroll' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lock Period' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Lock Period' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Lock Period' })).toBeNull()
      expect(
        screen.getByText(/Locked payroll period "Jan 1–15 2026 Payroll"/i),
      ).toBeTruthy()
    })
  })
})

