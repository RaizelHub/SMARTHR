<?php

namespace App\Services\Payroll\Statutory;

use App\Services\Payroll\MoneyMath;

/**
 * Verified Official Source:
 *   Agency: Social Security System (SSS)
 *   Issuance: SSS Circular No. 2024-006 (Republic Act No. 11199 final scheduled tranche)
 *   Official URL: https://www.sss.gov.ph/pay-contribution
 *   Effective Date: 2025-01-01 onwards
 *   Basis: Total monthly compensation mapped to 61 Monthly Salary Credit (MSC) brackets
 *          from PHP 5,000.00 to PHP 35,000.00 (PHP 500.00 increments).
 *   Rates: 15% total = 5% Employee + 10% Employer; Regular SS up to PHP 20,000 MSC,
 *          MPF/WISP on excess above PHP 20,000 up to PHP 35,000 MSC;
 *          Employer-only EC = PHP 10.00 for MSC <= PHP 14,500, PHP 30.00 for MSC >= PHP 15,000.
 */
final class PhSssCalculator
{
    public const RULE_KEY = 'SSS_2025_CIRCULAR_2024_006';

    public const EFFECTIVE_FROM = '2025-01-01';

    public const OFFICIAL_URL = 'https://www.sss.gov.ph/pay-contribution';

    /**
     * @return array{
     *   applied: bool,
     *   ruleKey: string,
     *   mscCentavos: int,
     *   regularSsMscCentavos: int,
     *   wispMscCentavos: int,
     *   employeeRegularCentavos: int,
     *   employeeWispCentavos: int,
     *   employeeTotalCentavos: int,
     *   employerRegularCentavos: int,
     *   employerWispCentavos: int,
     *   employerEcCentavos: int,
     *   employerTotalCentavos: int,
     *   warning: string|null
     * }
     */
    public function calculateMonthly(int $monthlyCompensationCentavos, string $asOfDate): array
    {
        if ($asOfDate < self::EFFECTIVE_FROM) {
            return $this->disabledResult(
                sprintf(
                    'SSS Circular No. 2024-006 applies starting %s; historical pre-2025 SSS table is not loaded for %s.',
                    self::EFFECTIVE_FROM,
                    $asOfDate,
                ),
            );
        }

        if ($monthlyCompensationCentavos <= 0) {
            return $this->disabledResult('SSS skipped: non-positive monthly compensation basis.');
        }

        $mscCentavos = $this->resolveMonthlySalaryCredit($monthlyCompensationCentavos);
        $regularMsc = min($mscCentavos, 2_000_000); // PHP 20,000.00
        $wispMsc = max(0, $mscCentavos - 2_000_000); // Excess above PHP 20,000 up to PHP 35,000

        $eeRegular = MoneyMath::roundHalfUpDiv($regularMsc * 5, 100);
        $eeWisp = MoneyMath::roundHalfUpDiv($wispMsc * 5, 100);

        $erRegular = MoneyMath::roundHalfUpDiv($regularMsc * 10, 100);
        $erWisp = MoneyMath::roundHalfUpDiv($wispMsc * 10, 100);
        $erEc = $mscCentavos >= 1_500_000 ? 3_000 : 1_000; // PHP 30.00 for MSC >= 15,000; PHP 10.00 otherwise

        return [
            'applied' => true,
            'ruleKey' => self::RULE_KEY,
            'mscCentavos' => $mscCentavos,
            'regularSsMscCentavos' => $regularMsc,
            'wispMscCentavos' => $wispMsc,
            'employeeRegularCentavos' => $eeRegular,
            'employeeWispCentavos' => $eeWisp,
            'employeeTotalCentavos' => $eeRegular + $eeWisp,
            'employerRegularCentavos' => $erRegular,
            'employerWispCentavos' => $erWisp,
            'employerEcCentavos' => $erEc,
            'employerTotalCentavos' => $erRegular + $erWisp + $erEc,
            'warning' => null,
        ];
    }

    public function resolveMonthlySalaryCredit(int $monthlyCompensationCentavos): int
    {
        // Minimum MSC: PHP 5,000.00 (500,000 centavos) for compensation < PHP 5,250.00
        if ($monthlyCompensationCentavos < 525_000) {
            return 500_000;
        }

        // Maximum MSC: PHP 35,000.00 (3,500,000 centavos) for compensation >= PHP 34,750.00
        if ($monthlyCompensationCentavos >= 3_475_000) {
            return 3_500_000;
        }

        // Step index above PHP 5,250.00 in exact PHP 500.00 (50,000 centavos) increments
        $steps = intdiv($monthlyCompensationCentavos - 525_000, 50_000);

        return 550_000 + ($steps * 50_000);
    }

    /**
     * @return array<string, mixed>
     */
    private function disabledResult(string $warning): array
    {
        return [
            'applied' => false,
            'ruleKey' => self::RULE_KEY,
            'mscCentavos' => 0,
            'regularSsMscCentavos' => 0,
            'wispMscCentavos' => 0,
            'employeeRegularCentavos' => 0,
            'employeeWispCentavos' => 0,
            'employeeTotalCentavos' => 0,
            'employerRegularCentavos' => 0,
            'employerWispCentavos' => 0,
            'employerEcCentavos' => 0,
            'employerTotalCentavos' => 0,
            'warning' => $warning,
        ];
    }
}
