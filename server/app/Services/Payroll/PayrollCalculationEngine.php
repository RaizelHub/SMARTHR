<?php

namespace App\Services\Payroll;

use App\Models\Employee;
use App\Models\EmployeeCompensation;
use App\Models\PayrollPeriod;
use App\Services\Payroll\Statutory\PhBirWithholdingTaxCalculator;
use App\Services\Payroll\Statutory\PhPagIbigCalculator;
use App\Services\Payroll\Statutory\PhPhilHealthCalculator;
use App\Services\Payroll\Statutory\PhSssCalculator;

final class PayrollCalculationEngine
{
    public const ENGINE_VERSION = 'phase-6b-v1';

    public function __construct(
        private readonly PhSssCalculator $sss = new PhSssCalculator,
        private readonly PhPhilHealthCalculator $philHealth = new PhPhilHealthCalculator,
        private readonly PhPagIbigCalculator $pagIbig = new PhPagIbigCalculator,
        private readonly PhBirWithholdingTaxCalculator $bir = new PhBirWithholdingTaxCalculator,
    ) {}

    /**
     * @param  list<array{category: string, code: string, label: string, amount_centavos: int, is_taxable: bool|null, adjustment_key: string}>  $manualAdjustments
     * @param  array{sss_ee: int, sss_er: int, philhealth_ee: int, philhealth_er: int, pagibig_ee: int, pagibig_er: int}  $priorMonthlyStatutory
     * @return array{
     *   lineItems: list<array<string, mixed>>,
     *   taxableCompensationCentavos: int,
     *   grossPayCentavos: int,
     *   totalStatutoryEmployeeCentavos: int,
     *   totalOtherDeductionsCentavos: int,
     *   totalDeductionsCentavos: int,
     *   totalEmployerCostCentavos: int,
     *   netPayCentavos: int,
     *   requiresReview: bool,
     *   hasNegativeNetPay: bool,
     *   warnings: list<string>,
     *   ruleSnapshot: array<string, mixed>
     * }
     */
    public function calculateEntry(
        Employee $employee,
        EmployeeCompensation $compensation,
        PayrollPeriod $period,
        ?int $confirmedPayableUnitsHundredths,
        array $manualAdjustments = [],
        array $priorMonthlyStatutory = [
            'sss_ee' => 0,
            'sss_er' => 0,
            'philhealth_ee' => 0,
            'philhealth_er' => 0,
            'pagibig_ee' => 0,
            'pagibig_er' => 0,
        ],
    ): array {
        $lineItems = [];
        $warnings = [];
        $requiresReview = false;
        $asOfDate = $period->period_end->format('Y-m-d');
        $scheduleType = $period->schedule_type;

        $taxableGrossCentavos = 0;

        // 1. Base Pay Calculation (exact centavos)
        $basePeriodCentavos = 0;
        if ($compensation->pay_basis === 'Monthly') {
            if ($scheduleType === 'Monthly') {
                $basePeriodCentavos = (int) $compensation->base_amount_centavos;
                $lineItems[] = $this->makeLine(
                    'Earning',
                    'BASE_PAY',
                    'Base Pay (Monthly)',
                    $basePeriodCentavos,
                    'Compensation Base',
                    true,
                );
            } elseif ($scheduleType === 'Semimonthly') {
                $basePeriodCentavos = MoneyMath::roundHalfUpDiv((int) $compensation->base_amount_centavos, 2);
                $lineItems[] = $this->makeLine(
                    'Earning',
                    'BASE_PAY',
                    'Base Pay (Semimonthly 1/2)',
                    $basePeriodCentavos,
                    'Compensation Base',
                    true,
                );
            } else {
                $lineItems[] = $this->makeLine(
                    'Earning',
                    'BASE_PAY',
                    'Base Pay (Unsupported Weekly factor)',
                    0,
                    'Compensation Base',
                    true,
                );
                $requiresReview = true;
                $warnings[] = 'Monthly pay basis on a Weekly schedule requires a confirmed annualization divisor policy. Base pay and monthly statutory rules held for review.';
            }
        } else {
            $unitNoun = $compensation->pay_basis === 'Daily' ? 'days' : 'hours';
            if ($confirmedPayableUnitsHundredths !== null) {
                $basePeriodCentavos = MoneyMath::multiplyHundredthsCentavos(
                    (int) $compensation->base_amount_centavos,
                    $confirmedPayableUnitsHundredths,
                );
                $formattedUnits = number_format($confirmedPayableUnitsHundredths / 100, 2);
                $lineItems[] = $this->makeLine(
                    'Earning',
                    'BASE_PAY',
                    sprintf('Base Pay (%s confirmed %s)', $formattedUnits, $unitNoun),
                    $basePeriodCentavos,
                    'Confirmed Payable Units',
                    true,
                );
            } else {
                $lineItems[] = $this->makeLine(
                    'Earning',
                    'BASE_PAY',
                    sprintf('Base Pay (%s units unconfirmed)', $compensation->pay_basis),
                    0,
                    'Compensation Base',
                    true,
                );
                $requiresReview = true;
                $warnings[] = "{$compensation->pay_basis} pay basis requires HR-confirmed payable {$unitNoun} before statutory calculations.";
            }
        }
        $taxableGrossCentavos += $basePeriodCentavos;

        // 2. Recurring Allowances (respect explicit taxable vs exempt flags)
        $monthlyTaxableAllowanceTotal = 0;
        foreach (($compensation->allowances_json ?? []) as $allowance) {
            $amt = (int) ($allowance['amountCentavos'] ?? 0);
            $label = (string) ($allowance['label'] ?? 'Allowance');
            $isTaxableFlag = array_key_exists('taxable', $allowance) ? $allowance['taxable'] : null;

            if ($compensation->pay_basis === 'Monthly' && $scheduleType === 'Weekly') {
                $requiresReview = true;
                $warnings[] = "Allowance \"{$label}\" skipped on Weekly schedule pending divisor policy.";

                continue;
            }

            $periodAmt = ($compensation->pay_basis === 'Monthly' && $scheduleType === 'Semimonthly')
                ? MoneyMath::roundHalfUpDiv($amt, 2)
                : $amt;

            if ($isTaxableFlag === null) {
                $requiresReview = true;
                $warnings[] = "Allowance \"{$label}\" taxability is unclassified; treated conservatively as taxable pending HR verification.";
                $effectiveTaxable = true;
            } else {
                $effectiveTaxable = (bool) $isTaxableFlag;
            }

            if ($effectiveTaxable) {
                $taxableGrossCentavos += $periodAmt;
                $monthlyTaxableAllowanceTotal += $amt;
            }

            $lineItems[] = $this->makeLine(
                'Earning',
                $effectiveTaxable ? 'ALLOWANCE_TAXABLE' : 'ALLOWANCE_EXEMPT',
                $scheduleType === 'Semimonthly' && $compensation->pay_basis === 'Monthly'
                    ? "{$label} (Semimonthly 1/2)"
                    : $label,
                $periodAmt,
                'Configured Allowance',
                $effectiveTaxable,
            );
        }

        // 3. Authorized Manual Adjustments (separated cleanly between Earnings & Deductions)
        foreach ($manualAdjustments as $adj) {
            $adjAmt = (int) $adj['amount_centavos'];
            if ($adj['category'] === 'Earning') {
                $adjTaxable = $adj['is_taxable'] ?? true;
                if ($adj['is_taxable'] === null) {
                    $requiresReview = true;
                    $warnings[] = "Adjustment \"{$adj['label']}\" taxability is unclassified; treated conservatively as taxable pending review.";
                }
                if ($adjTaxable) {
                    $taxableGrossCentavos += $adjAmt;
                }
                $lineItems[] = $this->makeLine(
                    'Earning',
                    'MANUAL_EARNING',
                    $adj['label'],
                    $adjAmt,
                    'Authorized Adjustment',
                    (bool) $adjTaxable,
                    $adj['adjustment_key'],
                );
            } else {
                $lineItems[] = $this->makeLine(
                    'EmployeeDeduction',
                    'MANUAL_DEDUCTION',
                    $adj['label'],
                    $adjAmt,
                    'Authorized Adjustment',
                    false,
                    $adj['adjustment_key'],
                );
            }
        }

        // 4. Philippine Statutory Contributions & Withholding Tax
        $statutoryMetadata = [
            'sssApplied' => false,
            'philHealthApplied' => false,
            'pagIbigApplied' => false,
            'birApplied' => false,
            'rules' => [],
        ];

        $sssEePeriod = 0;
        $philHealthEePeriod = 0;
        $pagIbigEePeriod = 0;
        $birWithholdingPeriod = 0;

        $canRunMonthlyContributions = $compensation->statutory_eligible
            && $compensation->pay_basis === 'Monthly'
            && in_array($scheduleType, ['Monthly', 'Semimonthly'], true);

        if (! $compensation->statutory_eligible) {
            $warnings[] = 'Employee compensation is marked statutory_eligible = false; SSS, PhilHealth, Pag-IBIG, and BIR auto-deductions skipped for manual verification.';
            $requiresReview = true;
        } elseif ($canRunMonthlyContributions) {
            $monthlyBasicCentavos = (int) $compensation->base_amount_centavos;
            $monthlyCompForSss = $monthlyBasicCentavos + $monthlyTaxableAllowanceTotal;

            // A. SSS (Circular 2024-006)
            $sssMonthly = $this->sss->calculateMonthly($monthlyCompForSss, $asOfDate);
            if ($sssMonthly['applied']) {
                $statutoryMetadata['sssApplied'] = true;
                $statutoryMetadata['rules']['sss'] = [
                    'ruleKey' => PhSssCalculator::RULE_KEY,
                    'officialUrl' => PhSssCalculator::OFFICIAL_URL,
                    'effectiveFrom' => PhSssCalculator::EFFECTIVE_FROM,
                    'mscCentavos' => $sssMonthly['mscCentavos'],
                ];

                $sssEePeriod = $this->allocatePeriodStatutory(
                    $sssMonthly['employeeTotalCentavos'],
                    $priorMonthlyStatutory['sss_ee'],
                    $period,
                    'SSS',
                    $warnings,
                );
                $sssErPeriod = $this->allocatePeriodStatutory(
                    $sssMonthly['employerTotalCentavos'],
                    $priorMonthlyStatutory['sss_er'],
                    $period,
                    'SSS Employer',
                    $warnings,
                    true,
                );

                if ($sssEePeriod > 0) {
                    $lineItems[] = $this->makeLine(
                        'EmployeeDeduction',
                        'SSS_EE',
                        sprintf('SSS Employee Share (MSC %s)', MoneyMath::formatPhp($sssMonthly['mscCentavos'])),
                        $sssEePeriod,
                        'Philippine Statutory (SSS)',
                        false,
                        null,
                        ['mscCentavos' => $sssMonthly['mscCentavos']],
                    );
                }
                if ($sssErPeriod > 0) {
                    $lineItems[] = $this->makeLine(
                        'EmployerCost',
                        'SSS_ER',
                        sprintf('SSS Employer + EC Share (MSC %s)', MoneyMath::formatPhp($sssMonthly['mscCentavos'])),
                        $sssErPeriod,
                        'Philippine Statutory (SSS)',
                        false,
                        null,
                        ['ecCentavos' => $sssMonthly['employerEcCentavos']],
                    );
                }
            } elseif ($sssMonthly['warning']) {
                $requiresReview = true;
                $warnings[] = $sssMonthly['warning'];
            }

            // B. PhilHealth (Circular 2020-0005 / 5% UHC) - Strictly Monthly Basic Salary
            $phMonthly = $this->philHealth->calculateMonthly($monthlyBasicCentavos, $asOfDate);
            if ($phMonthly['applied']) {
                $statutoryMetadata['philHealthApplied'] = true;
                $statutoryMetadata['rules']['philHealth'] = [
                    'ruleKey' => PhPhilHealthCalculator::RULE_KEY,
                    'officialUrl' => PhPhilHealthCalculator::OFFICIAL_URL,
                    'effectiveFrom' => PhPhilHealthCalculator::EFFECTIVE_FROM,
                    'basisMbsCentavos' => $phMonthly['basisMbsCentavos'],
                ];

                $philHealthEePeriod = $this->allocatePeriodStatutory(
                    $phMonthly['employeeMonthlyCentavos'],
                    $priorMonthlyStatutory['philhealth_ee'],
                    $period,
                    'PhilHealth',
                    $warnings,
                );
                $philHealthErPeriod = $this->allocatePeriodStatutory(
                    $phMonthly['employerMonthlyCentavos'],
                    $priorMonthlyStatutory['philhealth_er'],
                    $period,
                    'PhilHealth Employer',
                    $warnings,
                    true,
                );

                if ($philHealthEePeriod > 0) {
                    $lineItems[] = $this->makeLine(
                        'EmployeeDeduction',
                        'PHILHEALTH_EE',
                        'PhilHealth Employee Share (5.0% UHC)',
                        $philHealthEePeriod,
                        'Philippine Statutory (PhilHealth)',
                        false,
                    );
                }
                if ($philHealthErPeriod > 0) {
                    $lineItems[] = $this->makeLine(
                        'EmployerCost',
                        'PHILHEALTH_ER',
                        'PhilHealth Employer Share (5.0% UHC)',
                        $philHealthErPeriod,
                        'Philippine Statutory (PhilHealth)',
                        false,
                    );
                }
            } elseif ($phMonthly['warning']) {
                $requiresReview = true;
                $warnings[] = $phMonthly['warning'];
            }

            // C. Pag-IBIG (Circular 460)
            $pagIbigMonthly = $this->pagIbig->calculateMonthly($monthlyBasicCentavos, $asOfDate);
            if ($pagIbigMonthly['applied']) {
                $statutoryMetadata['pagIbigApplied'] = true;
                $statutoryMetadata['rules']['pagIbig'] = [
                    'ruleKey' => PhPagIbigCalculator::RULE_KEY,
                    'officialUrl' => PhPagIbigCalculator::OFFICIAL_URL,
                    'effectiveFrom' => PhPagIbigCalculator::EFFECTIVE_FROM,
                    'fundSalaryBasisCentavos' => $pagIbigMonthly['fundSalaryBasisCentavos'],
                ];

                $pagIbigEePeriod = $this->allocatePeriodStatutory(
                    $pagIbigMonthly['employeeMonthlyCentavos'],
                    $priorMonthlyStatutory['pagibig_ee'],
                    $period,
                    'Pag-IBIG',
                    $warnings,
                );
                $pagIbigErPeriod = $this->allocatePeriodStatutory(
                    $pagIbigMonthly['employerMonthlyCentavos'],
                    $priorMonthlyStatutory['pagibig_er'],
                    $period,
                    'Pag-IBIG Employer',
                    $warnings,
                    true,
                );

                if ($pagIbigEePeriod > 0) {
                    $lineItems[] = $this->makeLine(
                        'EmployeeDeduction',
                        'PAGIBIG_EE',
                        'Pag-IBIG Employee Contribution (Circ. 460)',
                        $pagIbigEePeriod,
                        'Philippine Statutory (Pag-IBIG)',
                        false,
                    );
                }
                if ($pagIbigErPeriod > 0) {
                    $lineItems[] = $this->makeLine(
                        'EmployerCost',
                        'PAGIBIG_ER',
                        'Pag-IBIG Employer Contribution (Circ. 460)',
                        $pagIbigErPeriod,
                        'Philippine Statutory (Pag-IBIG)',
                        false,
                    );
                }
            } elseif ($pagIbigMonthly['warning']) {
                $requiresReview = true;
                $warnings[] = $pagIbigMonthly['warning'];
            }
        } else {
            $requiresReview = true;
            $warnings[] = 'Fixed monthly SSS/PhilHealth/Pag-IBIG tables are held for HR verification on non-monthly or weekly bases.';
        }

        // D. BIR Withholding Tax (RR No. 11-2018 Annex E 2023+ schedule)
        $mandatoryEeTotal = $sssEePeriod + $philHealthEePeriod + $pagIbigEePeriod;
        $taxableCompCentavos = max(0, $taxableGrossCentavos - $mandatoryEeTotal);

        if ($compensation->statutory_eligible && ($canRunMonthlyContributions || $confirmedPayableUnitsHundredths !== null)) {
            $birResult = $this->bir->calculate(
                $taxableCompCentavos,
                $scheduleType,
                $asOfDate,
                (bool) $employee->is_minimum_wage_earner,
            );
            if ($birResult['applied']) {
                $statutoryMetadata['birApplied'] = true;
                $statutoryMetadata['rules']['bir'] = [
                    'ruleKey' => PhBirWithholdingTaxCalculator::RULE_KEY,
                    'officialUrl' => PhBirWithholdingTaxCalculator::OFFICIAL_URL,
                    'effectiveFrom' => PhBirWithholdingTaxCalculator::EFFECTIVE_FROM,
                    'minimumWageExempt' => (bool) $employee->is_minimum_wage_earner,
                ];
                $birWithholdingPeriod = $birResult['withholdingTaxCentavos'];
                if ($birWithholdingPeriod > 0) {
                    $lineItems[] = $this->makeLine(
                        'EmployeeDeduction',
                        'BIR_WT',
                        sprintf('BIR Withholding Tax (%s Annex E)', $scheduleType),
                        $birWithholdingPeriod,
                        'Philippine Statutory (BIR)',
                        false,
                    );
                }
            } elseif ($birResult['warning']) {
                $requiresReview = true;
                $warnings[] = $birResult['warning'];
            }
        }

        // 5. Aggregate Totals Strictly Separating Earnings, Employee Deductions, and Employer Costs
        $grossPayCentavos = 0;
        $totalStatutoryEeCentavos = 0;
        $totalOtherDeductionsCentavos = 0;
        $totalEmployerCostCentavos = 0;

        foreach ($lineItems as $item) {
            if ($item['category'] === 'Earning') {
                $grossPayCentavos += $item['amount_centavos'];
            } elseif ($item['category'] === 'EmployeeDeduction') {
                if (in_array($item['code'], ['SSS_EE', 'PHILHEALTH_EE', 'PAGIBIG_EE', 'BIR_WT'], true)) {
                    $totalStatutoryEeCentavos += $item['amount_centavos'];
                } else {
                    $totalOtherDeductionsCentavos += $item['amount_centavos'];
                }
            } elseif ($item['category'] === 'EmployerCost') {
                $totalEmployerCostCentavos += $item['amount_centavos'];
            }
        }

        $totalDeductionsCentavos = $totalStatutoryEeCentavos + $totalOtherDeductionsCentavos;
        $netPayCentavos = $grossPayCentavos - $totalDeductionsCentavos;
        $hasNegativeNetPay = $netPayCentavos < 0;

        if ($hasNegativeNetPay) {
            $requiresReview = true;
            $warnings[] = 'Negative net pay detected — total employee deductions exceed gross pay. Review required.';
        }

        return [
            'lineItems' => $lineItems,
            'taxableCompensationCentavos' => $taxableCompCentavos,
            'grossPayCentavos' => $grossPayCentavos,
            'totalStatutoryEmployeeCentavos' => $totalStatutoryEeCentavos,
            'totalOtherDeductionsCentavos' => $totalOtherDeductionsCentavos,
            'totalDeductionsCentavos' => $totalDeductionsCentavos,
            'totalEmployerCostCentavos' => $totalEmployerCostCentavos,
            'netPayCentavos' => $netPayCentavos,
            'requiresReview' => $requiresReview,
            'hasNegativeNetPay' => $hasNegativeNetPay,
            'warnings' => array_values(array_unique($warnings)),
            'ruleSnapshot' => [
                'engineVersion' => self::ENGINE_VERSION,
                'calculationMethod' => 'INTEGER_CENTAVOS',
                'roundingMode' => 'ROUND_HALF_UP',
                'asOfDate' => $asOfDate,
                'statutoryDeductionsEnabled' => true,
                'statutoryApplied' => $statutoryMetadata,
            ],
        ];
    }

    /**
     * Prevents duplicate monthly deductions on Semimonthly payroll by reconciling
     * against prior same-month entries for the employee.
     *
     * @param  list<string>  $warnings
     */
    private function allocatePeriodStatutory(
        int $monthlyRequiredCentavos,
        int $alreadyDeductedInMonthCentavos,
        PayrollPeriod $period,
        string $agencyLabel,
        array &$warnings,
        bool $suppressDuplicateWarning = false,
    ): int {
        if ($period->schedule_type === 'Monthly') {
            $remaining = max(0, $monthlyRequiredCentavos - $alreadyDeductedInMonthCentavos);
            if ($remaining === 0 && $monthlyRequiredCentavos > 0 && ! $suppressDuplicateWarning) {
                $warnings[] = "{$agencyLabel} monthly contribution already fulfilled by another period in the same calendar month; duplicate deduction prevented.";
            }

            return $remaining;
        }

        // Semimonthly handling
        $remaining = max(0, $monthlyRequiredCentavos - $alreadyDeductedInMonthCentavos);
        if ($remaining === 0 && $monthlyRequiredCentavos > 0) {
            if (! $suppressDuplicateWarning) {
                $warnings[] = "{$agencyLabel} monthly quota already fulfilled in this month; skipped duplicate semimonthly deduction.";
            }

            return 0;
        }

        if ($period->statutory_allocation_mode === 'FULL_SECOND_HALF') {
            return $period->semimonthly_half === 2 ? $remaining : 0;
        }

        // Default HALF_HALF mode: 1st half gets roundHalfUp(monthly / 2), 2nd half (or when prior exists) reconciles exact remainder
        if ($period->semimonthly_half === 2 || $alreadyDeductedInMonthCentavos > 0) {
            return $remaining;
        }

        return min($remaining, MoneyMath::roundHalfUpDiv($monthlyRequiredCentavos, 2));
    }

    /**
     * @param  array<string, mixed>|null  $metadata
     * @return array<string, mixed>
     */
    private function makeLine(
        string $category,
        string $code,
        string $label,
        int $amountCentavos,
        string $source,
        ?bool $isTaxable,
        ?string $adjustmentKey = null,
        ?array $metadata = null,
    ): array {
        return [
            'category' => $category,
            'code' => $code,
            'label' => $label,
            'amount_centavos' => $amountCentavos,
            'source' => $source,
            'is_taxable' => $isTaxable,
            'adjustment_key' => $adjustmentKey,
            'metadata_json' => $metadata,
        ];
    }
}

