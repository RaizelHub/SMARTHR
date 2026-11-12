<?php

namespace App\Services\Payroll\Statutory;

use App\Services\Payroll\MoneyMath;

/**
 * Verified Official Source:
 *   Agency: Philippine Health Insurance Corporation (PhilHealth)
 *   Issuance: PhilHealth Circular No. 2020-0005 / UHC Act (RA 11223) 5.0% schedule
 *   Official URL: https://www.philhealth.gov.ph/
 *   Effective Date: 2024-01-01 onwards
 *   Basis: Strictly Monthly Basic Salary (MBS) — excludes allowances, OT, and bonuses.
 *   Parameters: 5.0% total rate, Floor PHP 10,000.00 (PHP 500.00 total),
 *               Ceiling PHP 100,000.00 (PHP 5,000.00 total), split 50/50 EE & ER.
 */
final class PhPhilHealthCalculator
{
    public const RULE_KEY = 'PHILHEALTH_2024_5PCT';

    public const EFFECTIVE_FROM = '2024-01-01';

    public const OFFICIAL_URL = 'https://www.philhealth.gov.ph/';

    public const FLOOR_MBS_CENTAVOS = 1_000_000; // PHP 10,000.00

    public const CEILING_MBS_CENTAVOS = 10_000_000; // PHP 100,000.00

    /**
     * @return array{
     *   applied: bool,
     *   ruleKey: string,
     *   basisMbsCentavos: int,
     *   totalMonthlyCentavos: int,
     *   employeeMonthlyCentavos: int,
     *   employerMonthlyCentavos: int,
     *   warning: string|null
     * }
     */
    public function calculateMonthly(int $monthlyBasicSalaryCentavos, string $asOfDate): array
    {
        if ($asOfDate < self::EFFECTIVE_FROM) {
            return [
                'applied' => false,
                'ruleKey' => self::RULE_KEY,
                'basisMbsCentavos' => 0,
                'totalMonthlyCentavos' => 0,
                'employeeMonthlyCentavos' => 0,
                'employerMonthlyCentavos' => 0,
                'warning' => sprintf(
                    'PhilHealth 5.0%% schedule applies starting %s; pre-2024 rate schedule is not loaded for %s.',
                    self::EFFECTIVE_FROM,
                    $asOfDate,
                ),
            ];
        }

        if ($monthlyBasicSalaryCentavos <= 0) {
            return [
                'applied' => false,
                'ruleKey' => self::RULE_KEY,
                'basisMbsCentavos' => 0,
                'totalMonthlyCentavos' => 0,
                'employeeMonthlyCentavos' => 0,
                'employerMonthlyCentavos' => 0,
                'warning' => 'PhilHealth skipped: non-positive Monthly Basic Salary.',
            ];
        }

        $clampedMbs = max(
            self::FLOOR_MBS_CENTAVOS,
            min(self::CEILING_MBS_CENTAVOS, $monthlyBasicSalaryCentavos),
        );

        // Total monthly premium = 5.0% of clamped MBS, rounded half-up to nearest centavo
        $totalMonthly = MoneyMath::roundHalfUpDiv($clampedMbs * 5, 100);
        // Split 50/50 cleanly so EE + ER always equals exact totalMonthly
        $employeeShare = MoneyMath::roundHalfUpDiv($totalMonthly, 2);
        $employerShare = $totalMonthly - $employeeShare;

        return [
            'applied' => true,
            'ruleKey' => self::RULE_KEY,
            'basisMbsCentavos' => $clampedMbs,
            'totalMonthlyCentavos' => $totalMonthly,
            'employeeMonthlyCentavos' => $employeeShare,
            'employerMonthlyCentavos' => $employerShare,
            'warning' => null,
        ];
    }
}

