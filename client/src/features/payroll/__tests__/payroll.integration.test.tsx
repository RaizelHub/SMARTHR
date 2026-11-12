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
import Payroll from '../../../pages/Payroll'
import { AppRoutes } from '../../../routes/AppRouter'
import { AuthProvider } from '../../auth/AuthContext'
import { createDemoAuthService } from '../../auth/authService'
import { employeeService } from '../../employees/services/employeeService'
import {
  createDemoPayrollService,
  PayrollServiceError,
} from '../services/payrollService'

function renderAppAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

async function signInViaUi(employeeId: string) {
  await waitFor(() => {
    const select = screen.getByLabelText('Demo Account') as HTMLSelectElement
    expect(select.disabled).toBe(false)
  })
  fireEvent.change(screen.getByLabelText('Demo Account'), {
    target: { value: employeeId },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
}

function getMainNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Main navigation' })
}

describe('Payroll Foundation UI Integration Workflows', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('redirects unauthenticated /payroll visits to Sign In', async () => {
    renderAppAt('/payroll')
    await waitFor(() => {
      expect(screen.getByText('Sign In to Smart HR')).toBeTruthy()
    })
    expect(screen.queryByText('Payroll Foundation (Phase 6A)')).toBeNull()
  })

  it('runs end-to-end HR payroll workflow: compensation, period, draft run, negative net warning, payslip print preview, and In Review lock', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})

    renderAppAt('/')
    await signInViaUi('EMP-1005')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    })

    fireEvent.click(within(getMainNav()).getByText('Payroll'))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Payroll Foundation (Phase 6A)' }),
      ).toBeTruthy()
      expect(
        screen.getByText('No compensation records configured yet'),
      ).toBeTruthy()
    })

    // Verify Philippine compliance placeholders remain disabled pending Phase 6B
    expect(screen.getByText('Social Security System (SSS)')).toBeTruthy()
    expect(
      screen.getByText(/final approval, and payment disbursement remain disabled pending Phase 6B verification/i),
    ).toBeTruthy()

    // 1. Add Monthly compensation + allowance for Jordan Taylor (EMP-1001)
    fireEvent.change(screen.getByLabelText('Employee'), {
      target: { value: 'EMP-1001' },
    })
    fireEvent.change(screen.getByLabelText('Pay Basis'), {
      target: { value: 'Monthly' },
    })
    fireEvent.change(screen.getByLabelText('Base Amount (PHP)'), {
      target: { value: '30000.00' },
    })
    fireEvent.change(screen.getByLabelText('Effective Date'), {
      target: { value: '2026-11-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: '+ Add Allowance' }))
    fireEvent.change(screen.getByLabelText('Allowance label 1'), {
      target: { value: 'Rice Subsidy' },
    })
    fireEvent.change(screen.getByLabelText('Allowance amount 1'), {
      target: { value: '2000.00' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Compensation Record' }),
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Saved Monthly compensation record for EMP-1001/i),
      ).toBeTruthy()
      expect(screen.getByText('PHP 30,000.00')).toBeTruthy()
    })

    // 2. Create Semimonthly Payroll Period
    fireEvent.change(screen.getByLabelText('Schedule'), {
      target: { value: 'Semimonthly' },
    })
    fireEvent.change(screen.getByLabelText('Label (Optional)'), {
      target: { value: 'Nov 1–15 Payroll' },
    })
    fireEvent.change(screen.getByLabelText('Period Start'), {
      target: { value: '2026-11-01' },
    })
    fireEvent.change(screen.getByLabelText('Period End'), {
      target: { value: '2026-11-15' },
    })
    fireEvent.change(screen.getByLabelText('Pay Date'), {
      target: { value: '2026-11-20' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Create Payroll Period' }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Payroll Run: Nov 1–15 Payroll' }),
      ).toBeTruthy()
      expect(
        screen.getByText('Final Approval & Disbursement Disabled (Phase 6B)'),
      ).toBeTruthy()
    })

    // 3. Generate Draft Payroll -> creates EMP-1001 entry and surfaces missing compensation warnings for unconfigured employees
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate Draft Payroll' }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('payroll-kpi-count').textContent).toBe('1')
      expect(screen.getByTestId('payroll-kpi-gross').textContent).toBe(
        'PHP 16,000.00',
      )
      expect(
        screen.getByText(/Missing Compensation Warnings \(4 excluded\)/i),
      ).toBeTruthy()
    })

    // 4. Add Manual Deduction exceeding gross pay to verify negative net pay warning
    fireEvent.click(screen.getByRole('button', { name: 'Add Adjustment' }))
    fireEvent.change(
      screen.getByLabelText('Adjustment category for EMP-1001'),
      { target: { value: 'Deduction' } },
    )
    fireEvent.change(
      screen.getByLabelText('Adjustment description for EMP-1001'),
      { target: { value: 'Advance Settlement' } },
    )
    fireEvent.change(
      screen.getByLabelText('Adjustment amount for EMP-1001'),
      { target: { value: '18000.00' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save Adjustment' }))

    await waitFor(() => {
      expect(screen.getByTestId('payroll-kpi-net').textContent).toBe(
        '-PHP 2,000.00',
      )
      expect(
        screen.getByText(/Negative net pay detected/i),
      ).toBeTruthy()
    })

    // 5. Open Draft Payslip Preview and exercise Print Preview
    fireEvent.click(screen.getByRole('button', { name: 'Preview Payslip' }))
    await waitFor(() => {
      expect(screen.getByTestId('payslip-draft-watermark').textContent).toBe(
        'DRAFT / NOT FOR PAYMENT',
      )
      expect(screen.getByTestId('payslip-gross-pay').textContent).toBe(
        'PHP 16,000.00',
      )
      expect(screen.getByTestId('payslip-total-deductions').textContent).toBe(
        'PHP 18,000.00',
      )
      expect(screen.getByTestId('payslip-net-pay').textContent).toBe(
        '-PHP 2,000.00',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Print Preview' }))
    expect(printSpy).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close Payslip' }))

    // 6. Transition period from Draft -> In Review -> verify calculations lock
    fireEvent.click(screen.getByRole('button', { name: 'Mark In Review' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          /Marked payroll period "Nov 1–15 Payroll" as In Review/i,
        ),
      ).toBeTruthy()
      expect(
        screen.getByText(/Draft amounts and adjustments cannot be modified/i),
      ).toBeTruthy()
    })
    expect(
      screen.queryByRole('button', { name: 'Generate Draft Payroll' }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Adjustment' })).toBeNull()
  })

  it('restricts Employee and Manager to personal self-service payslips without coworker salary visibility', async () => {
    const paySvc = createDemoPayrollService({
      employeeService,
      storage: window.localStorage,
    })
    await employeeService.listDemoSignInProfiles()

    await paySvc.createCompensationRecord(
      {
        employeeId: 'EMP-1001',
        payBasis: 'Monthly',
        baseAmountInput: '32000.00',
        allowances: [],
        effectiveDate: '2026-11-01',
      },
      { actorEmployeeId: 'EMP-1005' },
    )
    await paySvc.createCompensationRecord(
      {
        employeeId: 'EMP-1003',
        payBasis: 'Monthly',
        baseAmountInput: '45000.00',
        allowances: [],
        effectiveDate: '2026-11-01',
      },
      { actorEmployeeId: 'EMP-1005' },
    )
    const period = await paySvc.createPayrollPeriod(
      {
        label: 'Nov 2026 Payroll',
        scheduleType: 'Monthly',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        payDate: '2026-11-30',
      },
      { actorEmployeeId: 'EMP-1005' },
    )
    await paySvc.generateDraftPayroll(period.id, { actorEmployeeId: 'EMP-1005' })

    // Sign in as Employee EMP-1001 (Jordan Taylor)
    renderAppAt('/')
    await signInViaUi('EMP-1001')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    })
    fireEvent.click(within(getMainNav()).getByText('Payroll'))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'My Draft Payslips' }),
      ).toBeTruthy()
      expect(screen.getByText('Nov 2026 Payroll')).toBeTruthy()
    })

    expect(screen.queryByText('Employee Compensation Records')).toBeNull()
    expect(screen.queryByText('Marcus Chen')).toBeNull()
    expect(screen.queryByText('PHP 45,000.00')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Preview My Payslip' }))
    await waitFor(() => {
      expect(screen.getByTestId('payslip-draft-watermark').textContent).toBe(
        'DRAFT / NOT FOR PAYMENT',
      )
      expect(screen.getByTestId('payslip-net-pay').textContent).toBe(
        'PHP 32,000.00',
      )
    })

    // Sign Out and verify Manager (EMP-1004) also cannot access organization or subordinate payroll
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }))
    await signInViaUi('EMP-1004')

    await waitFor(() => {
      expect(
        screen.getByText('No personal draft payslips generated yet'),
      ).toBeTruthy()
      expect(screen.getByText(/Dana Reyes/)).toBeTruthy()
    })
    expect(screen.queryByText('Employee Compensation Records')).toBeNull()
    expect(screen.queryByText('Jordan Taylor')).toBeNull()
  })

  it('displays error banner and recovers cleanly via Retry when payroll loading fails', async () => {
    const authSvc = createDemoAuthService({
      employeeService,
      storage: window.localStorage,
    })
    await employeeService.listDemoSignInProfiles()
    const signedInAdmin = await authSvc.signIn('EMP-1005')

    const baseService = createDemoPayrollService({
      employeeService,
      storage: window.localStorage,
    })
    let shouldFail = true
    const flakyService: typeof baseService = {
      ...baseService,
      async listCompensationRecords(actor) {
        if (shouldFail) {
          throw new PayrollServiceError(
            'PERSISTENCE_ERROR',
            'Temporary payroll storage read failure.',
            500,
          )
        }
        return baseService.listCompensationRecords(actor)
      },
    }

    render(
      <MemoryRouter initialEntries={['/payroll']}>
        <AuthProvider
          authService={authSvc}
          initialAuthState={{
            status: 'authenticated',
            user: signedInAdmin.user,
            session: signedInAdmin.session,
          }}
        >
          <Payroll payService={flakyService} />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Unable to load payroll data')).toBeTruthy()
      expect(
        screen.getByText('Temporary payroll storage read failure.'),
      ).toBeTruthy()
    })

    shouldFail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(
        screen.getByText('No compensation records configured yet'),
      ).toBeTruthy()
    })
    expect(screen.queryByText('Unable to load payroll data')).toBeNull()
  })
})

