import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoAttendanceService } from '../../attendance/services/attendanceService'
import {
  DEMO_SECURITY_AUDIT_KEY,
  readSecurityAuditEvents,
} from '../../auth/securityAudit'
import { employeeService } from '../../employees/services/employeeService'
import {
  createDemoPayrollService,
  DEMO_COMPENSATION_STORAGE_KEY,
  PayrollServiceError,
} from '../services/payrollService'

describe('Payroll Service — Compensation, Draft Runs, Locking, Security & Audit', () => {
  const hrAdmin = { actorEmployeeId: 'EMP-1005' }
  const hrCoord = { actorEmployeeId: 'EMP-1002' }
  const manager = { actorEmployeeId: 'EMP-1004' }
  const employee = { actorEmployeeId: 'EMP-1001' }
  const financeEmp = { actorEmployeeId: 'EMP-1003' }

  beforeEach(async () => {
    window.localStorage.clear()
    await employeeService.listDemoSignInProfiles()
  })

  it('starts empty without fabricated salaries', async () => {
    const svc = createDemoPayrollService({
      employeeService,
      storage: window.localStorage,
    })
    expect(await svc.listCompensationRecords(hrAdmin)).toEqual([])
    expect(await svc.listPayrollPeriods(hrAdmin)).toEqual([])
    expect(await svc.listMyPayslips(employee)).toEqual([])
  })

  it('creates effective-dated compensation, preserves history on updates, and rejects invalid/duplicate dates', async () => {
    const svc = createDemoPayrollService({
      employeeService,
      storage: window.localStorage,
    })

    await expect(
      svc.createCompensationRecord(
        {
          employeeId: 'EMP-1001',
          payBasis: 'Monthly',
          baseAmountInput: '-5000',
          allowances: [],
          effectiveDate: '2026-10-01',
        },
        hrAdmin,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 })

    const initial = await svc.createCompensationRecord(
      {
        employeeId: 'EMP-1001',
        payBasis: 'Monthly',
        baseAmountInput: '30000.00',
        allowances: [{ label: 'Rice Subsidy', amountInput: '2000.00' }],
        effectiveDate: '2026-10-01',
      },
      hrCoord,
    )
    expect(initial.baseAmountCentavos).toBe(3000000)
    expect(initial.status).toBe('Active')

    // Duplicate effective date rejected cleanly
    await expect(
      svc.createCompensationRecord(
        {
          employeeId: 'EMP-1001',
          payBasis: 'Monthly',
          baseAmountInput: '32000.00',
          allowances: [],
          effectiveDate: '2026-10-01',
        },
        hrAdmin,
      ),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_EFFECTIVE_DATE',
      httpStatus: 409,
    })

    // Adding a newer rate supersedes previous record with endDate = day before new effectiveDate
    const raise = await svc.createCompensationRecord(
      {
        employeeId: 'EMP-1001',
        payBasis: 'Monthly',
        baseAmountInput: '36000.00',
        allowances: [],
        effectiveDate: '2026-11-01',
      },
      hrAdmin,
    )
    expect(raise.status).toBe('Active')

    const allComps = await svc.listCompensationRecords(hrAdmin)
    const oldSaved = allComps.find((c) => c.id === initial.id)!
    expect(oldSaved.status).toBe('Superseded')
    expect(oldSaved.endDate).toBe('2026-10-31')
    expect(oldSaved.baseAmountCentavos).toBe(3000000)

    // Historical period (Oct 16-31) selects old rate (30,000 + 2,000), while Nov 1-15 selects new rate (36,000)
    const octPeriod = await svc.createPayrollPeriod(
      {
        label: 'Oct 16-31',
        scheduleType: 'Semimonthly',
        periodStart: '2026-10-16',
        periodEnd: '2026-10-31',
        payDate: '2026-11-05',
      },
      hrAdmin,
    )
    const novPeriod = await svc.createPayrollPeriod(
      {
        label: 'Nov 1-15',
        scheduleType: 'Semimonthly',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-15',
        payDate: '2026-11-20',
      },
      hrAdmin,
    )

    const octDraft = await svc.generateDraftPayroll(octPeriod.id, hrAdmin)
    const novDraft = await svc.generateDraftPayroll(novPeriod.id, hrAdmin)

    expect(octDraft.generatedEntries[0].grossPayCentavos).toBe(1600000) // (30k + 2k) / 2
    expect(novDraft.generatedEntries[0].grossPayCentavos).toBe(1800000) // 36k / 2
    expect(octDraft.missingCompensationWarnings).toHaveLength(4)
  })

  it('prevents overlapping payroll periods, duplicate draft generation, and duplicate adjustments', async () => {
    const svc = createDemoPayrollService({
      employeeService,
      storage: window.localStorage,
    })

    await svc.createCompensationRecord(
      {
        employeeId: 'EMP-1001',
        payBasis: 'Monthly',
        baseAmountInput: '30000',
        allowances: [],
        effectiveDate: '2026-11-01',
      },
      hrAdmin,
    )

    await expect(
      svc.createPayrollPeriod(
        {
          scheduleType: 'Semimonthly',
          periodStart: '2026-11-15',
          periodEnd: '2026-11-01',
          payDate: '2026-11-20',
        },
        hrAdmin,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 })

    const period = await svc.createPayrollPeriod(
      {
        scheduleType: 'Semimonthly',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-15',
        payDate: '2026-11-20',
      },
      hrAdmin,
    )

    await expect(
      svc.createPayrollPeriod(
        {
          scheduleType: 'Semimonthly',
          periodStart: '2026-11-10',
          periodEnd: '2026-11-25',
          payDate: '2026-11-30',
        },
        hrAdmin,
      ),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_PAYROLL_PERIOD',
      httpStatus: 409,
    })

    const firstGen = await svc.generateDraftPayroll(period.id, hrAdmin)
    expect(firstGen.addedCount).toBe(1)
    const entryId = firstGen.generatedEntries[0].id

    await svc.addManualAdjustment(
      {
        entryId,
        category: 'Earning',
        label: 'Spot Bonus',
        amountInput: '1000',
      },
      hrAdmin,
    )

    // Duplicate adjustment label/category on same entry rejected
    await expect(
      svc.addManualAdjustment(
        {
          entryId,
          category: 'Earning',
          label: '  spot bonus ',
          amountInput: '500',
        },
        hrAdmin,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ADJUSTMENT', httpStatus: 409 })

    // Re-running generation preserves existing entry and its adjustment, while adding newly configured employees
    await svc.createCompensationRecord(
      {
        employeeId: 'EMP-1003',
        payBasis: 'Daily',
        baseAmountInput: '1000',
        allowances: [],
        effectiveDate: '2026-11-01',
      },
      hrAdmin,
    )
    const secondGen = await svc.generateDraftPayroll(period.id, hrAdmin)
    expect(secondGen.preservedExistingCount).toBe(1)
    expect(secondGen.addedCount).toBe(1)
    const jordanEntry = secondGen.generatedEntries.find(
      (e) => e.employeeId === 'EMP-1001',
    )!
    expect(jordanEntry.grossPayCentavos).toBe(1600000) // 15,000 + 1,000 preserved
  })

  it('tracks Daily attendance sessions without auto-paying until HR confirms units, and locks mutations after In Review', async () => {
    const attSvc = createDemoAttendanceService({
      employeeService,
      storage: window.localStorage,
      now: () => new Date('2026-11-12T01:00:00.000Z'),
    })
    await attSvc.clockIn({ employeeId: 'EMP-1003' }, financeEmp)

    const svc = createDemoPayrollService({
      employeeService,
      attendanceService: attSvc,
      storage: window.localStorage,
      now: () => new Date('2026-11-12T05:00:00.000Z'),
    })

    await svc.createCompensationRecord(
      {
        employeeId: 'EMP-1003',
        payBasis: 'Daily',
        baseAmountInput: '1200.00',
        allowances: [],
        effectiveDate: '2026-11-01',
      },
      hrAdmin,
    )
    const period = await svc.createPayrollPeriod(
      {
        scheduleType: 'Semimonthly',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-15',
        payDate: '2026-11-20',
      },
      hrAdmin,
    )

    const draft = await svc.generateDraftPayroll(period.id, hrAdmin)
    const marcus = draft.generatedEntries[0]
    expect(marcus.attendanceSessionsInPeriod).toBe(1)
    expect(marcus.grossPayCentavos).toBe(0)
    expect(marcus.requiresReview).toBe(true)

    const confirmed = await svc.setConfirmedPayableUnits(
      { entryId: marcus.id, unitsInput: '10' },
      hrAdmin,
    )
    expect(confirmed.grossPayCentavos).toBe(1200000)
    expect(confirmed.requiresReview).toBe(false)

    // Transition Draft -> In Review
    const reviewed = await svc.markPeriodInReview(
      period.id,
      'Verified cutoff totals',
      hrCoord,
    )
    expect(reviewed.status).toBe('In Review')

    // Mutations blocked after In Review
    await expect(
      svc.addManualAdjustment(
        {
          entryId: marcus.id,
          category: 'Deduction',
          label: 'Late Penalty',
          amountInput: '100',
        },
        hrAdmin,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      httpStatus: 409,
    })

    await expect(
      svc.setConfirmedPayableUnits(
        { entryId: marcus.id, unitsInput: '9' },
        hrAdmin,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      httpStatus: 409,
    })

    await expect(
      svc.generateDraftPayroll(period.id, hrAdmin),
    ).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      httpStatus: 409,
    })

    // Final approval stays intentionally disabled in Phase 6A
    await expect(
      svc.approvePayrollPeriod(period.id, hrAdmin),
    ).rejects.toMatchObject({
      code: 'APPROVAL_POLICY_UNCONFIGURED',
      httpStatus: 403,
    })
  })

  it('enforces RBAC, Inactive/expired checks, cross-employee payslip isolation, non-leaky audit logs, and persistence failure detection', async () => {
    const svc = createDemoPayrollService({
      employeeService,
      storage: window.localStorage,
    })

    await svc.createCompensationRecord(
      {
        employeeId: 'EMP-1001',
        payBasis: 'Monthly',
        baseAmountInput: '35000.00',
        allowances: [],
        effectiveDate: '2026-11-01',
      },
      hrAdmin,
    )
    const period = await svc.createPayrollPeriod(
      {
        scheduleType: 'Monthly',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
        payDate: '2026-11-30',
      },
      hrAdmin,
    )
    const draft = await svc.generateDraftPayroll(period.id, hrAdmin)
    const jordanSlip = draft.generatedEntries[0]

    // Unauthenticated & expired session blocked
    await expect(
      svc.listMyPayslips({ actorEmployeeId: null }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 401 })

    await expect(
      svc.listMyPayslips({
        actorEmployeeId: 'EMP-1001',
        sessionExpiresAtUtc: '2020-01-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 401 })

    // Employee and Manager blocked from org compensation, periods, generation, audit, and coworker payslips
    for (const restrictedActor of [employee, manager]) {
      await expect(
        svc.listCompensationRecords(restrictedActor),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

      await expect(
        svc.createCompensationRecord(
          {
            employeeId: 'EMP-1001',
            payBasis: 'Monthly',
            baseAmountInput: '40000',
            allowances: [],
            effectiveDate: '2026-11-02',
          },
          restrictedActor,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

      await expect(
        svc.listPayrollPeriods(restrictedActor),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

      await expect(
        svc.listPayrollAuditHistory(restrictedActor),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })
    }

    // Manager & Finance coworker cannot inspect Jordan's payslip
    await expect(
      svc.getPayslipEntryById(jordanSlip.id, manager),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    await expect(
      svc.getPayslipEntryById(jordanSlip.id, financeEmp),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 403 })

    // Employee sees strictly own payslips
    const mySlips = await svc.listMyPayslips(employee)
    expect(mySlips).toHaveLength(1)
    expect(mySlips[0].id).toBe(jordanSlip.id)

    const managerSlips = await svc.listMyPayslips(manager)
    expect(managerSlips).toEqual([])

    // Audit records exist and never leak raw salary numbers in audit summaries
    const payAudit = await svc.listPayrollAuditHistory(hrAdmin)
    expect(payAudit.length).toBeGreaterThanOrEqual(3)
    expect(JSON.stringify(payAudit)).not.toContain('35000')
    expect(JSON.stringify(payAudit)).not.toContain('35,000')

    const secAudit = readSecurityAuditEvents(window.localStorage)
    expect(secAudit.some((e) => e.eventType === 'COMPENSATION_DENIED')).toBe(
      true,
    )
    expect(
      window.localStorage.getItem(DEMO_SECURITY_AUDIT_KEY),
    ).not.toContain('35000')

    // Inactive user blocked
    await employeeService.createEmployee(
      {
        employeeId: 'EMP-2500',
        fullName: 'Suspended User',
        workEmail: 'suspended@smarthr.demo',
        department: 'Sales',
        position: 'Associate',
        employmentStatus: 'Inactive',
        hireDate: '2026-01-15',
        assignedRole: 'Employee',
      },
      hrAdmin,
    )
    await expect(
      svc.listMyPayslips({ actorEmployeeId: 'EMP-2500' }),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_INACTIVE', httpStatus: 403 })

    // Corrupted storage throws structured 500 PERSISTENCE_ERROR
    window.localStorage.setItem(DEMO_COMPENSATION_STORAGE_KEY, '{broken-json')
    await expect(svc.listCompensationRecords(hrAdmin)).rejects.toBeInstanceOf(
      PayrollServiceError,
    )
    await expect(svc.listCompensationRecords(hrAdmin)).rejects.toMatchObject({
      code: 'PERSISTENCE_ERROR',
      httpStatus: 500,
    })
  })
})

