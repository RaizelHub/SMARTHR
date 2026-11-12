import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Leave from '../../../pages/Leave'
import { createDemoEmployeeService } from '../../employees/services/employeeService'
import {
  createDemoLeaveService,
  LeaveServiceError,
  type LeaveService,
} from '../services/leaveService'

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

function renderLeavePage(options?: {
  empService?: ReturnType<typeof createDemoEmployeeService>
  lvService?: LeaveService
  initialActorEmployeeId?: string | null
}) {
  return render(
    <MemoryRouter initialEntries={['/leave']}>
      <Leave
        empService={options?.empService}
        lvService={options?.lvService}
        initialActorEmployeeId={options?.initialActorEmployeeId}
      />
    </MemoryRouter>,
  )
}

describe('Leave Management request and approval integration workflow', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('submits valid leave, rejects missing/invalid/duplicate inputs, persists on reload, and allows cancellation', async () => {
    const empService = createDemoEmployeeService(window.localStorage)
    const lvService = createDemoLeaveService({
      employeeService: empService,
      storage: window.localStorage,
    })

    const startDate = formatOffsetUtcDate(5)
    const endDate = formatOffsetUtcDate(7)

    const firstRender = renderLeavePage({ empService, lvService })

    await waitFor(() => {
      expect(screen.getByText('No leave requests submitted yet')).toBeTruthy()
    })

    // Standard employee (EMP-1001) does not see Manager & HR review queue
    expect(screen.queryByText('Manager & HR Leave Review Queue')).toBeNull()

    // Missing required fields rejected
    fireEvent.click(screen.getByRole('button', { name: 'Submit Leave Request' }))
    await waitFor(() => {
      expect(screen.getByText('Leave type is required')).toBeTruthy()
      expect(screen.getByText('Start date is required')).toBeTruthy()
      expect(screen.getByText('End date is required')).toBeTruthy()
    })

    // End date earlier than start date rejected
    fireEvent.change(screen.getByLabelText(/Leave Type/i), {
      target: { value: 'Annual Leave' },
    })
    fireEvent.change(screen.getByLabelText(/Start Date/i), {
      target: { value: endDate },
    })
    fireEvent.change(screen.getByLabelText(/End Date/i), {
      target: { value: startDate },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Leave Request' }))

    await waitFor(() => {
      expect(
        screen.getByText('End date cannot be earlier than start date'),
      ).toBeTruthy()
    })

    // Valid submission succeeds
    fireEvent.change(screen.getByLabelText(/Start Date/i), {
      target: { value: startDate },
    })
    fireEvent.change(screen.getByLabelText(/End Date/i), {
      target: { value: endDate },
    })
    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: 'Family trip' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Leave Request' }))

    await waitFor(() => {
      expect(
        screen.getByText(
          new RegExp(`Submitted Annual Leave request \\(${startDate} to ${endDate}, 3 calendar days\\)`, 'i'),
        ),
      ).toBeTruthy()
    })

    // Duplicate submission rejected
    fireEvent.change(screen.getByLabelText(/Leave Type/i), {
      target: { value: 'Annual Leave' },
    })
    fireEvent.change(screen.getByLabelText(/Start Date/i), {
      target: { value: startDate },
    })
    fireEvent.change(screen.getByLabelText(/End Date/i), {
      target: { value: endDate },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Leave Request' }))

    await waitFor(() => {
      expect(screen.getByText(/Duplicate leave request/i)).toBeTruthy()
    })

    // Reload persistence verified
    firstRender.unmount()
    const reloadedService = createDemoLeaveService({
      employeeService: empService,
      storage: window.localStorage,
    })
    renderLeavePage({ empService, lvService: reloadedService })

    await waitFor(() => {
      expect(screen.getByText(`${startDate} to ${endDate}`)).toBeTruthy()
    })

    // Cancel pending request with inline confirmation
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Cancel' }))

    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeTruthy()
    })
  })

  it('allows HR reviewer to approve and reject requests with confirmation and preserves audit notes', async () => {
    const empService = createDemoEmployeeService(window.localStorage)
    const lvService = createDemoLeaveService({
      employeeService: empService,
      storage: window.localStorage,
    })

    const dateA = formatOffsetUtcDate(10)
    const dateB = formatOffsetUtcDate(15)

    await lvService.submitLeaveRequest(
      {
        employeeId: 'EMP-1001',
        leaveType: 'Annual Leave',
        startDate: dateA,
        endDate: dateA,
        reason: 'Personal errand',
      },
      { actorEmployeeId: 'EMP-1001' },
    )

    await lvService.submitLeaveRequest(
      {
        employeeId: 'EMP-1003',
        leaveType: 'Emergency Leave',
        startDate: dateB,
        endDate: dateB,
        reason: 'Urgent travel',
      },
      { actorEmployeeId: 'EMP-1003' },
    )

    // Render as HR Coordinator (EMP-1002)
    renderLeavePage({
      empService,
      lvService,
      initialActorEmployeeId: 'EMP-1002',
    })

    await waitFor(() => {
      expect(screen.getByText('Manager & HR Leave Review Queue')).toBeTruthy()
      expect(screen.getByText('Jordan Taylor')).toBeTruthy()
      expect(screen.getByText('Marcus Chen')).toBeTruthy()
    })

    // Approve Jordan Taylor's request with note
    const jordanCard = screen.getByLabelText('Leave request from Jordan Taylor')
    fireEvent.change(
      within(jordanCard).getByLabelText(/Reviewer Note/i),
      { target: { value: 'Approved with coverage' } },
    )
    fireEvent.click(within(jordanCard).getByRole('button', { name: 'Approve' }))
    fireEvent.click(
      within(jordanCard).getByRole('button', { name: 'Confirm Approve' }),
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Approved Jordan Taylor's Annual Leave request/i),
      ).toBeTruthy()
    })

    // Reject Marcus Chen's request
    const marcusCard = screen.getByLabelText('Leave request from Marcus Chen')
    fireEvent.change(
      within(marcusCard).getByLabelText(/Reviewer Note/i),
      { target: { value: 'Audit deadline' } },
    )
    fireEvent.click(within(marcusCard).getByRole('button', { name: 'Reject' }))
    fireEvent.click(
      within(marcusCard).getByRole('button', { name: 'Confirm Reject' }),
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Rejected Marcus Chen's Emergency Leave request/i),
      ).toBeTruthy()
    })

    expect(screen.getByText(/0 Pending/i)).toBeTruthy()
  })

  it('displays error banner without false success when leave submission request fails', async () => {
    const empService = createDemoEmployeeService(window.localStorage)
    const failingLvService: LeaveService = {
      isDemoMode: true,
      businessTimezone: 'Asia/Manila',
      balanceTrackingSupported: false,
      listLeaveRequests: vi.fn().mockResolvedValue([]),
      submitLeaveRequest: vi
        .fn()
        .mockRejectedValue(
          new LeaveServiceError(
            'PERSISTENCE_ERROR',
            'Simulated leave storage error.',
          ),
        ),
      cancelLeaveRequest: vi.fn(),
      reviewLeaveRequest: vi.fn(),
      clearLeaveRequests: vi.fn().mockResolvedValue([]),
    }

    renderLeavePage({ empService, lvService: failingLvService })

    await waitFor(() => {
      expect(screen.getByText('No leave requests submitted yet')).toBeTruthy()
    })

    const date = formatOffsetUtcDate(4)
    fireEvent.change(screen.getByLabelText(/Leave Type/i), {
      target: { value: 'Sick Leave' },
    })
    fireEvent.change(screen.getByLabelText(/Start Date/i), {
      target: { value: date },
    })
    fireEvent.change(screen.getByLabelText(/End Date/i), {
      target: { value: date },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Leave Request' }))

    await waitFor(() => {
      expect(screen.getByText('Unable to submit leave request')).toBeTruthy()
      expect(screen.getByText('Simulated leave storage error.')).toBeTruthy()
    })

    expect(screen.queryByText('Leave request submitted')).toBeNull()
  })
})
