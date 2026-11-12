<?php

namespace App\Services\Payroll\Statutory;

use App\Services\Payroll\MoneyMath;

/**
 * Verified Official Source:
 *   Agency: Bureau of Internal Revenue (BIR)
 *   Issuance: Revenue Regulations (RR) No. 11-2018 Annex "E" Revised Withholding Tax Tables
 *   Official URL: https://www.bir.gov.ph/
 *   Effective Date: 2023-01-01 onwards (TRAIN Law second tranche)
 *   Taxable Compensation = Taxable Gross Compensation - Employee Mandatory Contributions (SSS, PhilHealth, Pag-IBIG).
 *   Statutory Minimum Wage Earners (MWE) are tax-exempt per R.A. 9504 / TRAIN.
 */
final class PhBirWithholdingTaxCalculator
{
    public const RULE_KEY = 'BIR_WT_2023_RR_11_2018_ANNEX_E';

    public const EFFECTIVE_FROM = '2023-01-01';

    public const OFFICIAL_URL = 'https://www.bir.gov.ph/';

    /**
     * Exact bracket tables in integer centavos: [floorCentavos, baseTaxCentavos, excessRatePct].
     *
     * @var array<string, list<array{int, int, int}>>
     */
    private const BRACKETS = [
        'Daily' => [
            [0, 0, 0],
            [68_500, 0, 15],
            [109_600, 6_165, 20],
            [219_200, 28_085, 25],
            [547_900, 110_260, 30],
            [2_191_800, 603_400, 35],
        ],
        'Weekly' => [
            [0, 0, 0],
            [480_800, 0, 15],
            [769_200, 43_260, 20],
            [1_538_500, 197_120, 25],
            [3_846_200, 774_045, 30],
            [15_384_600, 4_235_565, 35],
        ],
        'Semimonthly' => [
            [0, 0, 0],
            [1_041_700, 0, 15],
            [1_666_700, 93_750, 20],
            [3_333_300, 427_070, 25],
            [8_333_300, 1_677_070, 30],
            [33_333_300, 9_177_070, 35],
        ],
        'Monthly' => [
            [0, 0, 0],
            [2_083_300, 0, 15],
            [3_333_300, 187_500, 20],
            [6_666_700, 854_180, 25],
            [16_666_700, 3_354_180, 30],
            [66_666_700, 18_354_180, 35],
        ],
    ];

    /**
     * @return array{
     *   applied: bool,
     *   ruleKey: string,
     *   taxableCompensationCentavos: int,
     *   withholdingTaxCentavos: int,
     *   warning: string|null
     * }
     */
    public function calculate(
        int $taxableCompensationCentavos,
        string $scheduleType,
        string $asOfDate,
        bool $isMinimumWageEarner,
    ): array {
        if ($asOfDate < self::EFFECTIVE_FROM) {
            return [
                'applied' => false,
                'ruleKey' => self::RULE_KEY,
                'taxableCompensationCentavos' => max(0, $taxableCompensationCentavos),
                'withholdingTaxCentavos' => 0,
                'warning' => sprintf(
                    'BIR 2023+ withholding tax table applies starting %s; pre-2023 table is not loaded for %s.',
                    self::EFFECTIVE_FROM,
                    $asOfDate,
                ),
            ];
        }

        if ($isMinimumWageEarner) {
            return [
                'applied' => true,
                'ruleKey' => self::RULE_KEY,
                'taxableCompensationCentavos' => max(0, $taxableCompensationCentavos),
                'withholdingTaxCentavos' => 0,
                'warning' => null,
            ];
        }

        $table = self::BRACKETS[$scheduleType] ?? null;
        if ($table === null) {
            return [
                'applied' => false,
                'ruleKey' => self::RULE_KEY,
                'taxableCompensationCentavos' => max(0, $taxableCompensationCentavos),
                'withholdingTaxCentavos' => 0,
                'warning' => "Unsupported BIR withholding tax schedule '{$scheduleType}'.",
            ];
        }

        if ($taxableCompensationCentavos <= 0) {
            return [
                'applied' => true,
                'ruleKey' => self::RULE_KEY,
                'taxableCompensationCentavos' => 0,
                'withholdingTaxCentavos' => 0,
                'warning' => null,
            ];
        }

        $matchedBracket = $table[0];
        foreach ($table as $bracket) {
            if ($taxableCompensationCentavos >= $bracket[0]) {
                $matchedBracket = $bracket;
            }
        }

        [$floorCentavos, $baseTaxCentavos, $ratePct] = $matchedBracket;
        $excess = max(0, $taxableCompensationCentavos - $floorCentavos);
        $taxOnExcess = $ratePct > 0
            ? MoneyMath::roundHalfUpDiv($excess * $ratePct, 100)
            : 0;

        return [
            'applied' => true,
            'ruleKey' => self::RULE_KEY,
            'taxableCompensationCentavos' => $taxableCompensationCentavos,
            'withholdingTaxCentavos' => $baseTaxCentavos + $taxOnExcess,
            'warning' => null,
        ];
    }
}

