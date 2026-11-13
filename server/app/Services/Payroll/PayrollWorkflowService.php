<?php

namespace App\Services\Payroll;

use App\Exceptions\PayrollDomainException;
use App\Models\Employee;
use App\Models\EmployeeCompensation;
use App\Models\PayrollAuditLog;
use App\Models\PayrollEntry;
use App\Models\PayrollLineItem;
use App\Models\PayrollPeriod;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class PayrollWorkflowService
{
    public function __construct(
        private readonly PayrollCalculationEngine $engine = new PayrollCalculationEngine,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function createCompensation(array $data, User $actor, ?string $ipAddress = null): EmployeeCompensation
    {
        return DB::transaction(function () use ($data, $actor, $ipAddress): EmployeeCompensation {
            $employee = Employee::query()
                ->where('employee_code', strtoupper(trim((string) $data['employee_code'])))
                ->first();

            if (! $employee) {
                throw new PayrollDomainException('EMPLOYEE_NOT_FOUND', 'Employee record was not found.', 404);
            }

            if ($employee->employment_status === 'Inactive') {
                throw new PayrollDomainException(
                    'EMPLOYEE_INACTIVE',
                    'Cannot create active compensation for an Inactive employee.',
                    403,
                );
            }

            $effectiveDate = (string) $data['effective_date'];
            $endDate = isset($data['end_date']) && $data['end_date'] !== '' ? (string) $data['end_date'] : null;

            $duplicate = EmployeeCompensation::query()
                ->where('employee_id', $employee->id)
                ->whereDate('effective_date', $effectiveDate)
                ->where('status', '!=', 'Inactive')
                ->exists();

            if ($duplicate) {
                throw new PayrollDomainException(
                    'DUPLICATE_EFFECTIVE_DATE',
                    "{$employee->full_name} already has a compensation record effective {$effectiveDate}.",
                    409,
                );
            }

            $baseCentavos = MoneyMath::parsePhpToCentavos((string) $data['base_amount']);
            $normalizedAllowances = [];
            foreach (($data['allowances'] ?? []) as $index => $item) {
                $normalizedAllowances[] = [
                    'id' => 'allow-'.($index + 1),
                    'label' => trim((string) $item['label']),
                    'amountCentavos' => MoneyMath::parsePhpToCentavos((string) $item['amount']),
                    'taxable' => array_key_exists('taxable', $item) ? $item['taxable'] : null,
                ];
            }

            // Preserve historical compensation records: close prior active open records at (effectiveDate - 1 day)
            $priorActive = EmployeeCompensation::query()
                ->where('employee_id', $employee->id)
                ->where('status', 'Active')
                ->whereDate('effective_date', '<', $effectiveDate)
                ->get();

            $dayBefore = CarbonImmutable::parse($effectiveDate)->subDay()->format('Y-m-d');
            foreach ($priorActive as $prior) {
                if ($prior->end_date === null || $prior->end_date->format('Y-m-d') >= $effectiveDate) {
                    $prior->update([
                        'end_date' => $dayBefore,
                        'status' => 'Superseded',
                    ]);
                }
            }

            $laterExists = EmployeeCompensation::query()
                ->where('employee_id', $employee->id)
                ->where('status', '!=', 'Inactive')
                ->whereDate('effective_date', '>', $effectiveDate)
                ->orderBy('effective_date')
                ->first();

            $status = 'Active';
            if ($laterExists) {
                $status = 'Superseded';
                $maxHistoricalEnd = CarbonImmutable::parse($laterExists->effective_date)->subDay()->format('Y-m-d');
                if ($endDate === null || $endDate >= $laterExists->effective_date->format('Y-m-d')) {
                    $endDate = $maxHistoricalEnd;
                }
            }

            $created = EmployeeCompensation::query()->create([
                'employee_id' => $employee->id,
                'pay_basis' => $data['pay_basis'],
                'base_amount_centavos' => $baseCentavos,
                'currency' => 'PHP',
                'allowances_json' => $normalizedAllowances,
                'statutory_eligible' => (bool) ($data['statutory_eligible'] ?? true),
                'effective_date' => $effectiveDate,
                'end_date' => $endDate,
                'status' => $status,
                'notes' => $data['notes'] ?? null,
                'created_by_user_id' => $actor->id,
            ]);

            $this->recordAudit(
                'COMPENSATION_CREATED',
                $actor,
                $employee->employee_code,
                null,
                null,
                "Configured {$created->pay_basis} compensation effective {$effectiveDate} (raw rate omitted)",
                $ipAddress,
            );

            return $created->load('employee');
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function createPeriod(array $data, User $actor, ?string $ipAddress = null): PayrollPeriod
    {
        return DB::transaction(function () use ($data, $actor, $ipAddress): PayrollPeriod {
            $overlap = PayrollPeriod::query()
                ->where('schedule_type', $data['schedule_type'])
                ->whereDate('period_start', '<=', $data['period_end'])
                ->whereDate('period_end', '>=', $data['period_start'])
                ->exists();

            if ($overlap) {
                throw new PayrollDomainException(
                    'DUPLICATE_PAYROLL_PERIOD',
                    "An overlapping {$data['schedule_type']} payroll period already exists.",
                    409,
                );
            }

            $semimonthlyHalf = null;
            if ($data['schedule_type'] === 'Semimonthly') {
                if (isset($data['semimonthly_half'])) {
                    $semimonthlyHalf = (int) $data['semimonthly_half'];
                } else {
                    $startDay = (int) CarbonImmutable::parse((string) $data['period_start'])->day;
                    $semimonthlyHalf = $startDay <= 15 ? 1 : 2;
                }
            }

            $period = PayrollPeriod::query()->create([
                'label' => trim((string) ($data['label'] ?? '')) !== ''
                    ? trim((string) $data['label'])
                    : "{$data['schedule_type']} {$data['period_start']} to {$data['period_end']}",
                'schedule_type' => $data['schedule_type'],
                'period_start' => $data['period_start'],
                'period_end' => $data['period_end'],
                'pay_date' => $data['pay_date'],
                'semimonthly_half' => $semimonthlyHalf,
                'statutory_allocation_mode' => $data['statutory_allocation_mode'] ?? 'HALF_HALF',
                'status' => PayrollPeriod::STATUS_DRAFT,
                'business_timezone' => 'Asia/Manila',
                'created_by_user_id' => $actor->id,
                'version' => 1,
            ]);

            $this->recordAudit(
                'PAYROLL_PERIOD_CREATED',
                $actor,
                null,
                $period->id,
                null,
                "Created {$period->schedule_type} payroll period \"{$period->label}\"",
                $ipAddress,
            );

            return $period;
        });
    }

    /**
     * @return array{period: PayrollPeriod, addedCount: int, preservedExistingCount: int, missingCompensationWarnings: list<array<string, string>>}
     */
    public function generateAndCalculate(PayrollPeriod $period, User $actor, ?string $ipAddress = null): array
    {
        return DB::transaction(function () use ($period, $actor, $ipAddress): array {
            /** @var PayrollPeriod $lockedPeriod */
            $lockedPeriod = PayrollPeriod::query()->whereKey($period->id)->lockForUpdate()->firstOrFail();

            if (! $lockedPeriod->isMutable()) {
                throw new PayrollDomainException(
                    'INVALID_STATUS_TRANSITION',
                    "Payroll period \"{$lockedPeriod->label}\" is {$lockedPeriod->status} and cannot regenerate or alter calculations.",
                    409,
                );
            }

            $asOfDate = $lockedPeriod->period_end->format('Y-m-d');
            $employees = Employee::query()
                ->where('employment_status', '!=', 'Inactive')
                ->orderBy('full_name')
                ->get();

            $existingEmployeeIds = PayrollEntry::query()
                ->where('payroll_period_id', $lockedPeriod->id)
                ->pluck('employee_id')
                ->map(fn ($id): int => (int) $id)
                ->flip();

            $employeeIds = $employees->pluck('id')->all();

            // Preload effective compensations in one query per period to avoid N+1 lookups
            $effectiveCompByEmployee = EmployeeCompensation::query()
                ->whereIn('employee_id', $employeeIds)
                ->where('status', '!=', 'Inactive')
                ->whereDate('effective_date', '<=', $asOfDate)
                ->where(function ($query) use ($asOfDate): void {
                    $query->whereNull('end_date')->orWhereDate('end_date', '>=', $asOfDate);
                })
                ->orderByDesc('effective_date')
                ->orderByDesc('id')
                ->get()
                ->groupBy('employee_id')
                ->map(fn ($group) => $group->first());

            // Preload prior same-month statutory totals in one bulk query across all employees
            $priorStatutoryByEmployee = $this->getBulkPriorSameMonthStatutoryTotals($employeeIds, $lockedPeriod);

            $addedCount = 0;
            $preservedCount = 0;
            $missingWarnings = [];

            foreach ($employees as $employee) {
                if ($existingEmployeeIds->has((int) $employee->id)) {
                    $preservedCount++;

                    continue;
                }

                /** @var EmployeeCompensation|null $comp */
                $comp = $effectiveCompByEmployee->get($employee->id);
                if (! $comp) {
                    $missingWarnings[] = [
                        'employeeCode' => $employee->employee_code,
                        'employeeName' => $employee->full_name,
                        'department' => $employee->department,
                        'reason' => "No effective compensation covering {$asOfDate}.",
                    ];

                    continue;
                }

                $priorTotals = $priorStatutoryByEmployee[$employee->id] ?? null;
                $entry = $this->persistCalculatedEntry($employee, $comp, $lockedPeriod, null, [], $priorTotals);
                $addedCount++;
                unset($entry);
            }

            $lockedPeriod->update([
                'status' => PayrollPeriod::STATUS_CALCULATED,
                'version' => $lockedPeriod->version + 1,
            ]);

            $this->recordAudit(
                'PAYROLL_CALCULATED',
                $actor,
                null,
                $lockedPeriod->id,
                null,
                "Generated & calculated payroll \"{$lockedPeriod->label}\": {$addedCount} created, {$preservedCount} preserved, ".count($missingWarnings).' missing compensation',
                $ipAddress,
            );

            return [
                'period' => $lockedPeriod->fresh(['createdBy.employee', 'reviewedBy.employee', 'approvedBy.employee', 'lockedBy.employee']),
                'addedCount' => $addedCount,
                'preservedExistingCount' => $preservedCount,
                'missingCompensationWarnings' => $missingWarnings,
            ];
        });
    }

    public function setConfirmedPayableUnits(
        PayrollEntry $entry,
        string $unitsInput,
        User $actor,
        ?string $ipAddress = null,
    ): PayrollEntry {
        return DB::transaction(function () use ($entry, $unitsInput, $actor, $ipAddress): PayrollEntry {
            $lockedEntry = PayrollEntry::query()->whereKey($entry->id)->lockForUpdate()->firstOrFail();
            $lockedPeriod = PayrollPeriod::query()->whereKey($lockedEntry->payroll_period_id)->lockForUpdate()->firstOrFail();

            if (! $lockedPeriod->isMutable() || $lockedPeriod->isFinalized()) {
                throw new PayrollDomainException(
                    'INVALID_STATUS_TRANSITION',
                    'Payroll entry is locked and cannot be modified outside Draft/Calculated status.',
                    409,
                );
            }

            if ($lockedEntry->pay_basis === 'Monthly') {
                throw new PayrollDomainException(
                    'VALIDATION_ERROR',
                    'Confirmed payable units apply only to Daily or Hourly compensation bases.',
                    400,
                );
            }

            $unitsHundredths = $this->parseUnitsHundredths($unitsInput);
            $manualAdjustments = $this->extractManualAdjustments($lockedEntry);
            $lockedEntry->lineItems()->delete();

            $updated = $this->rebuildEntryTotals(
                $lockedEntry,
                $lockedEntry->employee,
                $lockedEntry->compensation,
                $lockedPeriod,
                $unitsHundredths,
                $manualAdjustments,
            );

            $this->recordAudit(
                'PAYROLL_UNITS_CONFIRMED',
                $actor,
                $lockedEntry->employee->employee_code,
                $lockedPeriod->id,
                $updated->id,
                "Confirmed {$unitsInput} payable units for {$updated->pay_basis} entry",
                $ipAddress,
            );

            return $updated;
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function addManualAdjustment(
        PayrollEntry $entry,
        array $data,
        User $actor,
        ?string $ipAddress = null,
    ): PayrollEntry {
        return DB::transaction(function () use ($entry, $data, $actor, $ipAddress): PayrollEntry {
            $lockedEntry = PayrollEntry::query()->whereKey($entry->id)->lockForUpdate()->firstOrFail();
            $lockedPeriod = PayrollPeriod::query()->whereKey($lockedEntry->payroll_period_id)->lockForUpdate()->firstOrFail();

            if (! $lockedPeriod->isMutable() || $lockedPeriod->isFinalized()) {
                throw new PayrollDomainException(
                    'INVALID_STATUS_TRANSITION',
                    'Cannot modify payroll adjustments once period is submitted for review or finalized.',
                    409,
                );
            }

            $category = $data['category'] === 'Earning' ? 'Earning' : 'EmployeeDeduction';
            $label = trim((string) $data['label']);
            $adjustmentKey = strtolower("{$category}:".preg_replace('/\s+/', ' ', $label));

            $duplicate = $lockedEntry->lineItems()
                ->where('adjustment_key', $adjustmentKey)
                ->exists();

            if ($duplicate) {
                throw new PayrollDomainException(
                    'DUPLICATE_ADJUSTMENT',
                    "Duplicate adjustment \"{$label}\" already exists on this payroll entry.",
                    409,
                );
            }

            $manualAdjustments = $this->extractManualAdjustments($lockedEntry);
            $manualAdjustments[] = [
                'category' => $category,
                'code' => $category === 'Earning' ? 'MANUAL_EARNING' : 'MANUAL_DEDUCTION',
                'label' => $label,
                'amount_centavos' => MoneyMath::parsePhpToCentavos((string) $data['amount']),
                'is_taxable' => array_key_exists('is_taxable', $data) ? $data['is_taxable'] : ($category === 'Earning'),
                'adjustment_key' => $adjustmentKey,
            ];

            $lockedEntry->lineItems()->delete();
            $updated = $this->rebuildEntryTotals(
                $lockedEntry,
                $lockedEntry->employee,
                $lockedEntry->compensation,
                $lockedPeriod,
                $lockedEntry->confirmed_payable_units_hundredths,
                $manualAdjustments,
            );

            $this->recordAudit(
                'PAYROLL_ADJUSTMENT_ADDED',
                $actor,
                $lockedEntry->employee->employee_code,
                $lockedPeriod->id,
                $updated->id,
                "Added {$data['category']} adjustment \"{$label}\" to payroll period \"{$lockedPeriod->label}\"",
                $ipAddress,
            );

            return $updated;
        });
    }

    public function submitForReview(PayrollPeriod $period, User $actor, ?string $notes = null, ?string $ipAddress = null): PayrollPeriod
    {
        return DB::transaction(function () use ($period, $actor, $notes, $ipAddress): PayrollPeriod {
            $lockedPeriod = PayrollPeriod::query()->whereKey($period->id)->lockForUpdate()->firstOrFail();

            if (! $lockedPeriod->isMutable()) {
                throw new PayrollDomainException(
                    'INVALID_STATUS_TRANSITION',
                    "Cannot submit period from status {$lockedPeriod->status}.",
                    409,
                );
            }

            $entryCount = $lockedPeriod->entries()->count();
            if ($entryCount === 0) {
                throw new PayrollDomainException(
                    'VALIDATION_ERROR',
                    'Calculate payroll entries before submitting for review.',
                    400,
                );
            }

            $now = now('UTC');
            $lockedPeriod->update([
                'status' => PayrollPeriod::STATUS_UNDER_REVIEW,
                'reviewed_by_user_id' => $actor->id,
                'reviewed_at' => $now,
                'review_notes' => $notes ? trim($notes) : null,
                'returned_reason' => null,
                'version' => $lockedPeriod->version + 1,
            ]);

            $lockedPeriod->entries()->update(['status' => PayrollPeriod::STATUS_UNDER_REVIEW]);

            $this->recordAudit(
                'PAYROLL_SUBMITTED_FOR_REVIEW',
                $actor,
                null,
                $lockedPeriod->id,
                null,
                "Submitted payroll period \"{$lockedPeriod->label}\" for review ({$entryCount} entries)",
                $ipAddress,
            );

            return $lockedPeriod->fresh(['createdBy.employee', 'reviewedBy.employee', 'approvedBy.employee', 'lockedBy.employee']);
        });
    }

    public function returnForCorrection(PayrollPeriod $period, User $actor, string $reason, ?string $ipAddress = null): PayrollPeriod
    {
        return DB::transaction(function () use ($period, $actor, $reason, $ipAddress): PayrollPeriod {
            $lockedPeriod = PayrollPeriod::query()->whereKey($period->id)->lockForUpdate()->firstOrFail();

            if ($lockedPeriod->status !== PayrollPeriod::STATUS_UNDER_REVIEW) {
                throw new PayrollDomainException(
                    'INVALID_STATUS_TRANSITION',
                    'Only periods currently Under Review can be returned for correction.',
                    409,
                );
            }

            $lockedPeriod->update([
                'status' => PayrollPeriod::STATUS_CALCULATED,
                'returned_reason' => trim($reason),
                'version' => $lockedPeriod->version + 1,
            ]);

            $lockedPeriod->entries()->update(['status' => PayrollPeriod::STATUS_CALCULATED]);

            $this->recordAudit(
                'PAYROLL_RETURNED_FOR_CORRECTION',
                $actor,
                null,
                $lockedPeriod->id,
                null,
                "Returned payroll period \"{$lockedPeriod->label}\" to Calculated for correction",
                $ipAddress,
            );

            return $lockedPeriod->fresh(['createdBy.employee', 'reviewedBy.employee', 'approvedBy.employee', 'lockedBy.employee']);
        });
    }

    public function approvePeriod(
        PayrollPeriod $period,
        User $actor,
        ?string $notes = null,
        ?int $expectedVersion = null,
        ?string $ipAddress = null,
    ): PayrollPeriod {
        return DB::transaction(function () use ($period, $actor, $notes, $expectedVersion, $ipAddress): PayrollPeriod {
            $lockedPeriod = PayrollPeriod::query()->whereKey($period->id)->lockForUpdate()->firstOrFail();

            if ($expectedVersion !== null && $lockedPeriod->version !== $expectedVersion) {
                throw new PayrollDomainException(
                    'CONCURRENT_STATE_CONFLICT',
                    'Payroll period was modified by another request. Refresh and inspect before approving.',
                    409,
                );
            }

            if ($lockedPeriod->status !== PayrollPeriod::STATUS_UNDER_REVIEW) {
                throw new PayrollDomainException(
                    'INVALID_STATUS_TRANSITION',
                    "Only Under Review periods can be approved (current status: {$lockedPeriod->status}).",
                    409,
                );
            }

            // Enforce reviewer/approver segregation of duties (Maker-Checker)
            if ($lockedPeriod->reviewed_by_user_id !== null && (int) $lockedPeriod->reviewed_by_user_id === (int) $actor->id) {
                throw new PayrollDomainException(
                    'SEGREGATION_OF_DUTIES_VIOLATION',
                    'The user who submitted this payroll period for review cannot approve their own submission.',
                    403,
                );
            }

            $now = now('UTC');
            $lockedPeriod->update([
                'status' => PayrollPeriod::STATUS_APPROVED,
                'approved_by_user_id' => $actor->id,
                'approved_at' => $now,
                'approval_notes' => $notes ? trim($notes) : null,
                'version' => $lockedPeriod->version + 1,
            ]);

            $lockedPeriod->entries()->update(['status' => PayrollPeriod::STATUS_APPROVED]);

            $this->recordAudit(
                'PAYROLL_APPROVED',
                $actor,
                null,
                $lockedPeriod->id,
                null,
                "Approved payroll period \"{$lockedPeriod->label}\" (not a payment disbursement record)",
                $ipAddress,
            );

            return $lockedPeriod->fresh(['createdBy.employee', 'reviewedBy.employee', 'approvedBy.employee', 'lockedBy.employee']);
        });
    }

    public function lockPeriod(
        PayrollPeriod $period,
        User $actor,
        ?int $expectedVersion = null,
        ?string $ipAddress = null,
    ): PayrollPeriod {
        return DB::transaction(function () use ($period, $actor, $expectedVersion, $ipAddress): PayrollPeriod {
            $lockedPeriod = PayrollPeriod::query()->whereKey($period->id)->lockForUpdate()->firstOrFail();

            if ($expectedVersion !== null && $lockedPeriod->version !== $expectedVersion) {
                throw new PayrollDomainException(
                    'CONCURRENT_STATE_CONFLICT',
                    'Payroll period version mismatch during lock request.',
                    409,
                );
            }

            if ($lockedPeriod->status !== PayrollPeriod::STATUS_APPROVED) {
                throw new PayrollDomainException(
                    'INVALID_STATUS_TRANSITION',
                    'Only Approved payroll periods can be transitioned to Locked.',
                    409,
                );
            }

            $lockedPeriod->update([
                'status' => PayrollPeriod::STATUS_LOCKED,
                'locked_by_user_id' => $actor->id,
                'locked_at' => now('UTC'),
                'version' => $lockedPeriod->version + 1,
            ]);

            $lockedPeriod->entries()->update(['status' => PayrollPeriod::STATUS_LOCKED]);

            $this->recordAudit(
                'PAYROLL_LOCKED',
                $actor,
                null,
                $lockedPeriod->id,
                null,
                "Locked payroll period \"{$lockedPeriod->label}\" permanently against edits",
                $ipAddress,
            );

            return $lockedPeriod->fresh(['createdBy.employee', 'reviewedBy.employee', 'approvedBy.employee', 'lockedBy.employee']);
        });
    }

    /**
     * @param  list<array<string, mixed>>  $manualAdjustments
     * @param  array{sss_ee: int, sss_er: int, philhealth_ee: int, philhealth_er: int, pagibig_ee: int, pagibig_er: int}|null  $preloadedPrior
     */
    private function persistCalculatedEntry(
        Employee $employee,
        EmployeeCompensation $comp,
        PayrollPeriod $period,
        ?int $confirmedUnits,
        array $manualAdjustments,
        ?array $preloadedPrior = null,
    ): PayrollEntry {
        $prior = $preloadedPrior ?? $this->getPriorSameMonthStatutoryTotals($employee->id, $period);
        $calc = $this->engine->calculateEntry($employee, $comp, $period, $confirmedUnits, $manualAdjustments, $prior);

        $entry = PayrollEntry::query()->create([
            'payroll_period_id' => $period->id,
            'employee_id' => $employee->id,
            'compensation_id' => $comp->id,
            'pay_basis' => $comp->pay_basis,
            'base_compensation_centavos' => $comp->base_amount_centavos,
            'currency' => 'PHP',
            'confirmed_payable_units_hundredths' => $confirmedUnits,
            'taxable_compensation_centavos' => $calc['taxableCompensationCentavos'],
            'gross_pay_centavos' => $calc['grossPayCentavos'],
            'total_statutory_employee_centavos' => $calc['totalStatutoryEmployeeCentavos'],
            'total_other_deductions_centavos' => $calc['totalOtherDeductionsCentavos'],
            'total_deductions_centavos' => $calc['totalDeductionsCentavos'],
            'total_employer_cost_centavos' => $calc['totalEmployerCostCentavos'],
            'net_pay_centavos' => $calc['netPayCentavos'],
            'status' => PayrollPeriod::STATUS_CALCULATED,
            'requires_review' => $calc['requiresReview'],
            'has_negative_net_pay' => $calc['hasNegativeNetPay'],
            'warnings_json' => $calc['warnings'],
            'rule_snapshot_json' => $calc['ruleSnapshot'],
        ]);

        if ($calc['lineItems'] !== []) {
            $entry->lineItems()->createMany($calc['lineItems']);
        }

        return $entry->load(['employee', 'lineItems']);
    }

    /**
     * @param  list<array<string, mixed>>  $manualAdjustments
     */
    private function rebuildEntryTotals(
        PayrollEntry $entry,
        Employee $employee,
        EmployeeCompensation $comp,
        PayrollPeriod $period,
        ?int $confirmedUnits,
        array $manualAdjustments,
    ): PayrollEntry {
        $prior = $this->getPriorSameMonthStatutoryTotals($employee->id, $period);
        $calc = $this->engine->calculateEntry($employee, $comp, $period, $confirmedUnits, $manualAdjustments, $prior);

        $entry->update([
            'confirmed_payable_units_hundredths' => $confirmedUnits,
            'taxable_compensation_centavos' => $calc['taxableCompensationCentavos'],
            'gross_pay_centavos' => $calc['grossPayCentavos'],
            'total_statutory_employee_centavos' => $calc['totalStatutoryEmployeeCentavos'],
            'total_other_deductions_centavos' => $calc['totalOtherDeductionsCentavos'],
            'total_deductions_centavos' => $calc['totalDeductionsCentavos'],
            'total_employer_cost_centavos' => $calc['totalEmployerCostCentavos'],
            'net_pay_centavos' => $calc['netPayCentavos'],
            'requires_review' => $calc['requiresReview'],
            'has_negative_net_pay' => $calc['hasNegativeNetPay'],
            'warnings_json' => $calc['warnings'],
            'rule_snapshot_json' => $calc['ruleSnapshot'],
        ]);

        foreach ($calc['lineItems'] as $line) {
            $entry->lineItems()->create($line);
        }

        return $entry->fresh(['employee', 'lineItems', 'payrollPeriod']);
    }

    /**
     * Queries prior payroll periods in the same YYYY-MM pay-month to prevent duplicate
     * monthly SSS/PhilHealth/Pag-IBIG deductions across semimonthly cutoffs.
     *
     * @return array{sss_ee: int, sss_er: int, philhealth_ee: int, philhealth_er: int, pagibig_ee: int, pagibig_er: int}
     */
    private function getPriorSameMonthStatutoryTotals(int $employeeId, PayrollPeriod $currentPeriod): array
    {
        $bulk = $this->getBulkPriorSameMonthStatutoryTotals([$employeeId], $currentPeriod);

        return $bulk[$employeeId] ?? [
            'sss_ee' => 0,
            'sss_er' => 0,
            'philhealth_ee' => 0,
            'philhealth_er' => 0,
            'pagibig_ee' => 0,
            'pagibig_er' => 0,
        ];
    }

    /**
     * @param  list<int>  $employeeIds
     * @return array<int, array{sss_ee: int, sss_er: int, philhealth_ee: int, philhealth_er: int, pagibig_ee: int, pagibig_er: int}>
     */
    private function getBulkPriorSameMonthStatutoryTotals(array $employeeIds, PayrollPeriod $currentPeriod): array
    {
        if ($employeeIds === []) {
            return [];
        }

        $monthStart = $currentPeriod->period_end->copy()->startOfMonth()->format('Y-m-d');
        $monthEnd = $currentPeriod->period_end->copy()->endOfMonth()->format('Y-m-d');

        $rows = PayrollLineItem::query()
            ->join('payroll_entries', 'payroll_entries.id', '=', 'payroll_line_items.payroll_entry_id')
            ->join('payroll_periods', 'payroll_periods.id', '=', 'payroll_entries.payroll_period_id')
            ->whereIn('payroll_entries.employee_id', $employeeIds)
            ->where('payroll_entries.payroll_period_id', '!=', $currentPeriod->id)
            ->whereDate('payroll_periods.period_end', '>=', $monthStart)
            ->whereDate('payroll_periods.period_end', '<=', $monthEnd)
            ->whereIn('payroll_line_items.code', ['SSS_EE', 'SSS_ER', 'PHILHEALTH_EE', 'PHILHEALTH_ER', 'PAGIBIG_EE', 'PAGIBIG_ER'])
            ->selectRaw('payroll_entries.employee_id as emp_id, LOWER(payroll_line_items.code) as stat_code, SUM(payroll_line_items.amount_centavos) as total_centavos')
            ->groupBy('payroll_entries.employee_id', 'payroll_line_items.code')
            ->get();

        $empty = [
            'sss_ee' => 0,
            'sss_er' => 0,
            'philhealth_ee' => 0,
            'philhealth_er' => 0,
            'pagibig_ee' => 0,
            'pagibig_er' => 0,
        ];

        $result = [];
        foreach ($employeeIds as $id) {
            $result[(int) $id] = $empty;
        }

        foreach ($rows as $row) {
            $empId = (int) $row->emp_id;
            $code = (string) $row->stat_code;
            if (isset($result[$empId]) && array_key_exists($code, $result[$empId])) {
                $result[$empId][$code] += (int) $row->total_centavos;
            }
        }

        return $result;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function extractManualAdjustments(PayrollEntry $entry): array
    {
        $items = [];
        foreach ($entry->lineItems as $item) {
            if ($item->source === 'Authorized Adjustment' && $item->adjustment_key !== null) {
                $items[] = [
                    'category' => $item->category,
                    'code' => $item->code,
                    'label' => $item->label,
                    'amount_centavos' => (int) $item->amount_centavos,
                    'is_taxable' => $item->is_taxable,
                    'adjustment_key' => $item->adjustment_key,
                ];
            }
        }

        return $items;
    }

    private function parseUnitsHundredths(string $raw): int
    {
        $normalized = str_replace(',', '', trim($raw));
        if (! preg_match('/^(\d+)(?:\.(\d+))?$/', $normalized, $matches)) {
            throw new PayrollDomainException('VALIDATION_ERROR', 'Payable units must be a non-negative number.', 400);
        }

        $frac = $matches[2] ?? '';
        if (strlen($frac) > 2) {
            throw new PayrollDomainException('VALIDATION_ERROR', 'Payable units support up to 2 decimals.', 400);
        }

        $hundredths = ((int) $matches[1] * 100) + (int) str_pad($frac, 2, '0', STR_PAD_RIGHT);
        if ($hundredths > 100_000) {
            throw new PayrollDomainException('VALIDATION_ERROR', 'Payable units cannot exceed 1,000.00.', 400);
        }

        return $hundredths;
    }

    public function recordAudit(
        string $eventType,
        User $actor,
        ?string $targetEmployeeCode,
        ?int $periodId,
        ?int $entryId,
        string $summary,
        ?string $ipAddress = null,
    ): void {
        $actorEmp = $actor->employee;

        PayrollAuditLog::query()->create([
            'event_type' => $eventType,
            'actor_user_id' => $actor->id,
            'actor_employee_code' => $actorEmp?->employee_code ?? 'SYSTEM',
            'actor_role' => $actorEmp?->assigned_role ?? 'Unknown',
            'target_employee_code' => $targetEmployeeCode,
            'payroll_period_id' => $periodId,
            'payroll_entry_id' => $entryId,
            'summary' => $summary,
            'ip_address' => $ipAddress,
            'occurred_at_utc' => now('UTC'),
        ]);
    }
}
