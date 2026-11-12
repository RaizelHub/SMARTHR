<?php

namespace App\Services\Payroll\Statutory;

use App\Services\Payroll\MoneyMath;

/**
 * Verified Official Source:
 *   Agency: Home Development Mutual Fund (Pag-IBIG Fund)
 *   Issuance: Pag-IBIG Fund Circular No. 460 (Max Fund Salary increased to PHP 10,000.00)
 *   Official URL: https://www.pagibigfund.gov.ph/
 *   Effective Date: 2024-02-01 onwards
 *   Rates: <= PHP 1,500.00 -> 1% EE / 2% ER; > PHP 1,500.00 -> 2% EE / 2% ER,
 *          capped at PHP 10,000.00 Maximum Fund Salary (max PHP 200.00 EE / PHP 200.00 ER).
 */
final class PhPagIbigCalculator
{
    public const RULE_KEY = 'PAGIBIG_2024_CIRCULAR_460';

    public const EFFECTIVE_FROM = '2024-02-01';

    public const OFFICIAL_URL = 'https://www.pagibigfund.gov.ph/';

    public const MAX_FUND_SALARY_CENTAVOS = 1_000_000; // PHP 10,000.00

    public const LOWER_BRACKET_THRESHOLD_CENTAVOS = 150_000; // PHP 1,500.00

    /**
     * @return array{
     *   applied: bool,
     *   ruleKey: string,
     *   fundSalaryBasisCentavos: int,
     *   employeeMonthlyCentavos: int,
     *   employerMonthlyCentavos: int,
     *   warning: string|null
     * }
     */
    public function calculateMonthly(int $monthlyFundSalaryCentavos, string $asOfDate): array
    {
        if ($asOfDate < self::EFFECTIVE_FROM) {
            return [
                'applied' => false,
                'ruleKey' => self::RULE_KEY,
                'fundSalaryBasisCentavos' => 0,
                'employeeMonthlyCentavos' => 0,
                'employerMonthlyCentavos' => 0,
                'warning' => sprintf(
                    'Pag-IBIG Circular No. 460 applies starting %s; pre-Feb-2024 PHP 5,000 cap schedule is not loaded for %s.',
                    self::EFFECTIVE_FROM,
                    $asOfDate,
                ),
            ];
        }

        if ($monthlyFundSalaryCentavos <= 0) {
            return [
                'applied' => false,
                'ruleKey' => self::RULE_KEY,
                'fundSalaryBasisCentavos' => 0,
                'employeeMonthlyCentavos' => 0,
                'employerMonthlyCentavos' => 0,
                'warning' => 'Pag-IBIG skipped: non-positive monthly fund salary.',
            ];
        }

        $cappedBasis = min(self::MAX_FUND_SALARY_CENTAVOS, $monthlyFundSalaryCentavos);
        $eeRatePct = $monthlyFundSalaryCentavos <= self::LOWER_BRACKET_THRESHOLD_CENTAVOS ? 1 : 2;
        $erRatePct = 2;

        $employeeMonthly = MoneyMath::roundHalfUpDiv($cappedBasis * $eeRatePct, 100);
        $employerMonthly = MoneyMath::roundHalfUpDiv($cappedBasis * $erRatePct, 100);

        return [
            'applied' => true,
            'ruleKey' => self::RULE_KEY,
            'fundSalaryBasisCentavos' => $cappedBasis,
            'employeeMonthlyCentavos' => $employeeMonthly,
            'employerMonthlyCentavos' => $employerMonthly,
            'warning' => null,
        ];
    }
}

