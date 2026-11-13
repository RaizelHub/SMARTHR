<?php

namespace App\Http\Transformers;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\EmployeeCompensation;
use App\Models\LeaveDecisionLog;
use App\Models\LeaveRequest;
use App\Models\PayrollAuditLog;
use App\Models\PayrollEntry;
use App\Models\PayrollPeriod;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Support\RolePermissions;

final class PayrollPresenter
{
    /**
     * @return array<string, mixed>
     */
    public static function userSession(User $user): array
    {
        $emp = $user->employee;

        return [
            'id' => $user->id,
            'email' => $user->email,
            'employeeId' => $emp?->employee_code ?? '',
            'fullName' => $emp?->full_name ?? $user->name,
            'workEmail' => $emp?->work_email ?? $user->email,
            'department' => $emp?->department ?? 'Operations',
            'position' => $emp?->position ?? 'Staff',
            'employmentStatus' => $emp?->employment_status ?? 'Active',
            'assignedRole' => $emp?->assigned_role ?? 'Employee',
            'isMinimumWageEarner' => (bool) ($emp?->is_minimum_wage_earner ?? false),
            'hireDate' => $emp?->hire_date?->format('Y-m-d') ?? '',
            'permissions' => RolePermissions::forRole($emp?->assigned_role),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function employeeReference(Employee $emp): array
    {
        return [
            'id' => (string) $emp->id,
            'employeeId' => $emp->employee_code,
            'fullName' => $emp->full_name,
            'workEmail' => $emp->work_email,
            'department' => $emp->department,
            'position' => $emp->position,
            'employmentStatus' => $emp->employment_status,
            'assignedRole' => $emp->assigned_role,
            'isMinimumWageEarner' => (bool) $emp->is_minimum_wage_earner,
            'hireDate' => $emp->hire_date->format('Y-m-d'),
            'createdAt' => $emp->created_at?->toIso8601String() ?? ($emp->hire_date->format('Y-m-d').'T00:00:00.000Z'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function compensation(EmployeeCompensation $comp): array
    {
        $emp = $comp->employee;

        return [
            'id' => (string) $comp->id,
            'employeeId' => $emp?->employee_code ?? '',
            'employeeName' => $emp?->full_name ?? '',
            'department' => $emp?->department ?? 'Operations',
            'payBasis' => $comp->pay_basis,
            'baseAmountCentavos' => (int) $comp->base_amount_centavos,
            'currency' => $comp->currency,
            'statutoryEligible' => (bool) $comp->statutory_eligible,
            'allowances' => array_values($comp->allowances_json ?? []),
            'effectiveDate' => $comp->effective_date->format('Y-m-d'),
            'endDate' => $comp->end_date?->format('Y-m-d'),
            'status' => $comp->status,
            'notes' => $comp->notes ?? '',
            'createdAtUtc' => $comp->created_at?->toIso8601String() ?? '',
            'updatedAtUtc' => $comp->updated_at?->toIso8601String() ?? '',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function period(PayrollPeriod $period): array
    {
        return [
            'id' => (string) $period->id,
            'label' => $period->label,
            'scheduleType' => $period->schedule_type,
            'periodStart' => $period->period_start->format('Y-m-d'),
            'periodEnd' => $period->period_end->format('Y-m-d'),
            'payDate' => $period->pay_date->format('Y-m-d'),
            'semimonthlyHalf' => $period->semimonthly_half,
            'statutoryAllocationMode' => $period->statutory_allocation_mode,
            'status' => $period->status,
            'businessTimezone' => $period->business_timezone,
            'createdByEmployeeId' => $period->createdBy?->employee?->employee_code ?? '',
            'createdByName' => $period->createdBy?->employee?->full_name ?? $period->createdBy?->name ?? 'System',
            'reviewedByEmployeeId' => $period->reviewedBy?->employee?->employee_code,
            'reviewedByName' => $period->reviewedBy?->employee?->full_name ?? $period->reviewedBy?->name,
            'reviewedAtUtc' => $period->reviewed_at?->toIso8601String(),
            'reviewNotes' => $period->review_notes,
            'approvedByEmployeeId' => $period->approvedBy?->employee?->employee_code,
            'approvedByName' => $period->approvedBy?->employee?->full_name ?? $period->approvedBy?->name,
            'approvedAtUtc' => $period->approved_at?->toIso8601String(),
            'approvalNotes' => $period->approval_notes,
            'lockedByEmployeeId' => $period->lockedBy?->employee?->employee_code,
            'lockedByName' => $period->lockedBy?->employee?->full_name ?? $period->lockedBy?->name,
            'lockedAtUtc' => $period->locked_at?->toIso8601String(),
            'returnedReason' => $period->returned_reason,
            'version' => (int) $period->version,
            'createdAtUtc' => $period->created_at?->toIso8601String() ?? '',
            'updatedAtUtc' => $period->updated_at?->toIso8601String() ?? '',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function entry(PayrollEntry $entry, int $attendanceSessionsInPeriod = 0): array
    {
        $emp = $entry->employee;
        $period = $entry->payrollPeriod;

        $earnings = [];
        $deductions = [];
        $employerCosts = [];

        foreach ($entry->lineItems as $item) {
            $mapped = [
                'id' => (string) $item->id,
                'category' => $item->category === 'Earning' ? 'Earning' : ($item->category === 'EmployerCost' ? 'EmployerCost' : 'Deduction'),
                'code' => $item->code,
                'label' => $item->label,
                'amountCentavos' => (int) $item->amount_centavos,
                'source' => $item->source,
                'isTaxable' => $item->is_taxable,
                'adjustmentKey' => $item->adjustment_key,
            ];

            if ($item->category === 'Earning') {
                $earnings[] = $mapped;
            } elseif ($item->category === 'EmployerCost') {
                $employerCosts[] = $mapped;
            } else {
                $deductions[] = $mapped;
            }
        }

        return [
            'id' => (string) $entry->id,
            'payrollPeriodId' => (string) $entry->payroll_period_id,
            'periodLabel' => $period?->label ?? '',
            'scheduleType' => $period?->schedule_type ?? 'Semimonthly',
            'periodStart' => $period?->period_start->format('Y-m-d') ?? '',
            'periodEnd' => $period?->period_end->format('Y-m-d') ?? '',
            'payDate' => $period?->pay_date->format('Y-m-d') ?? '',
            'employeeId' => $emp?->employee_code ?? '',
            'employeeName' => $emp?->full_name ?? '',
            'department' => $emp?->department ?? 'Operations',
            'compensationId' => (string) $entry->compensation_id,
            'payBasis' => $entry->pay_basis,
            'baseCompensationCentavos' => (int) $entry->base_compensation_centavos,
            'currency' => $entry->currency,
            'confirmedPayableUnitsHundredths' => $entry->confirmed_payable_units_hundredths,
            'attendanceSessionsInPeriod' => $attendanceSessionsInPeriod,
            'earnings' => $earnings,
            'deductions' => $deductions,
            'employerCosts' => $employerCosts,
            'taxableCompensationCentavos' => (int) $entry->taxable_compensation_centavos,
            'grossPayCentavos' => (int) $entry->gross_pay_centavos,
            'totalStatutoryEmployeeCentavos' => (int) $entry->total_statutory_employee_centavos,
            'totalOtherDeductionsCentavos' => (int) $entry->total_other_deductions_centavos,
            'totalDeductionsCentavos' => (int) $entry->total_deductions_centavos,
            'totalEmployerCostCentavos' => (int) $entry->total_employer_cost_centavos,
            'netPayCentavos' => (int) $entry->net_pay_centavos,
            'status' => $entry->status,
            'requiresReview' => (bool) $entry->requires_review,
            'hasNegativeNetPay' => (bool) $entry->has_negative_net_pay,
            'warnings' => array_values($entry->warnings_json ?? []),
            'ruleSnapshot' => $entry->rule_snapshot_json ?? [],
            'createdAtUtc' => $entry->created_at?->toIso8601String() ?? '',
            'updatedAtUtc' => $entry->updated_at?->toIso8601String() ?? '',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function auditLog(PayrollAuditLog $log): array
    {
        return [
            'id' => (string) $log->id,
            'eventType' => $log->event_type,
            'actorEmployeeId' => $log->actor_employee_code,
            'actorName' => $log->actor_employee_code,
            'actorRole' => $log->actor_role,
            'targetEmployeeId' => $log->target_employee_code,
            'payrollPeriodId' => $log->payroll_period_id ? (string) $log->payroll_period_id : null,
            'summary' => $log->summary,
            'timestampUtc' => $log->occurred_at_utc->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function attendance(Attendance $att): array
    {
        return [
            'id' => (string) $att->id,
            'employeeId' => $att->employee?->employee_code ?? '',
            'employeeName' => $att->employee?->full_name ?? '',
            'attendanceDate' => $att->attendance_date->format('Y-m-d'),
            'clockInAtUtc' => $att->clock_in_at_utc->toIso8601String(),
            'clockOutAtUtc' => $att->clock_out_at_utc?->toIso8601String(),
            'durationMinutes' => $att->duration_minutes,
            'status' => $att->status,
            'businessTimezone' => $att->business_timezone,
            'createdAtUtc' => $att->created_at?->toIso8601String() ?? '',
            'updatedAtUtc' => $att->updated_at?->toIso8601String() ?? '',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function leaveRequest(LeaveRequest $req): array
    {
        $emp = $req->employee;
        $revEmp = $req->reviewedBy?->employee;
        $cancelLog = $req->decisionLogs->firstWhere('action', 'Cancelled');

        return [
            'id' => (string) $req->id,
            'employeeId' => $emp?->employee_code ?? '',
            'employeeName' => $emp?->full_name ?? '',
            'department' => $emp?->department ?? 'Operations',
            'leaveType' => $req->leave_type,
            'startDate' => $req->start_date->format('Y-m-d'),
            'endDate' => $req->end_date->format('Y-m-d'),
            'calendarDays' => (int) $req->total_days,
            'reason' => $req->reason,
            'status' => $req->status,
            'businessTimezone' => 'Asia/Manila',
            'submittedAtUtc' => $req->created_at?->toIso8601String() ?? '',
            'reviewedByEmployeeId' => $revEmp?->employee_code,
            'reviewedByName' => $revEmp?->full_name ?? $req->reviewedBy?->name,
            'reviewedByRole' => $revEmp?->assigned_role,
            'reviewedAtUtc' => $req->reviewed_at_utc?->toIso8601String(),
            'reviewerNote' => $req->reviewer_note,
            'cancelledAtUtc' => $cancelLog?->occurred_at_utc?->toIso8601String(),
            'decisionHistory' => $req->decisionLogs->map(fn (LeaveDecisionLog $log): array => [
                'action' => $log->action,
                'actorEmployeeId' => $log->actor_employee_code,
                'actorName' => $log->actor_name,
                'actorRole' => $log->actor_role,
                'timestampUtc' => $log->occurred_at_utc->toIso8601String(),
                'note' => $log->note,
            ])->values()->all(),
            'updatedAtUtc' => $req->updated_at?->toIso8601String() ?? '',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function securityAudit(SecurityAuditLog $log): array
    {
        return [
            'id' => (string) $log->id,
            'eventType' => $log->event_type,
            'actorEmployeeId' => $log->actor_employee_code,
            'actorRole' => $log->actor_role,
            'targetEmployeeId' => $log->target_employee_code,
            'summary' => $log->summary,
            'timestampUtc' => $log->occurred_at_utc->toIso8601String(),
        ];
    }
}
