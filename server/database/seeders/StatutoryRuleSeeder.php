<?php

namespace Database\Seeders;

use App\Models\PayrollStatutoryRuleVersion;
use App\Services\Payroll\Statutory\PhBirWithholdingTaxCalculator;
use App\Services\Payroll\Statutory\PhPagIbigCalculator;
use App\Services\Payroll\Statutory\PhPhilHealthCalculator;
use App\Services\Payroll\Statutory\PhSssCalculator;
use Illuminate\Database\Seeder;

class StatutoryRuleSeeder extends Seeder
{
    public function run(): void
    {
        $rules = [
            [
                'rule_key' => PhSssCalculator::RULE_KEY,
                'agency' => 'SSS',
                'issuance_reference' => 'SSS Circular No. 2024-006 (R.A. 11199 Final Tranche)',
                'official_url' => PhSssCalculator::OFFICIAL_URL,
                'effective_from' => PhSssCalculator::EFFECTIVE_FROM,
                'effective_to' => null,
                'is_active' => true,
                'parameters_json' => [
                    'totalRatePct' => 15,
                    'employeeRatePct' => 5,
                    'employerRatePct' => 10,
                    'minMscCentavos' => 500_000,
                    'regularCapMscCentavos' => 2_000_000,
                    'maxMscCentavos' => 3_500_000,
                    'ecLowCentavos' => 1_000,
                    'ecHighCentavos' => 3_000,
                    'ecHighThresholdMscCentavos' => 1_500_000,
                ],
            ],
            [
                'rule_key' => PhPhilHealthCalculator::RULE_KEY,
                'agency' => 'PhilHealth',
                'issuance_reference' => 'PhilHealth Circular No. 2020-0005 / UHC Act 5.0%',
                'official_url' => PhPhilHealthCalculator::OFFICIAL_URL,
                'effective_from' => PhPhilHealthCalculator::EFFECTIVE_FROM,
                'effective_to' => null,
                'is_active' => true,
                'parameters_json' => [
                    'ratePct' => 5,
                    'floorMbsCentavos' => PhPhilHealthCalculator::FLOOR_MBS_CENTAVOS,
                    'ceilingMbsCentavos' => PhPhilHealthCalculator::CEILING_MBS_CENTAVOS,
                    'split' => '50/50 Employee-Employer',
                ],
            ],
            [
                'rule_key' => PhPagIbigCalculator::RULE_KEY,
                'agency' => 'Pag-IBIG',
                'issuance_reference' => 'Pag-IBIG Fund Circular No. 460',
                'official_url' => PhPagIbigCalculator::OFFICIAL_URL,
                'effective_from' => PhPagIbigCalculator::EFFECTIVE_FROM,
                'effective_to' => null,
                'is_active' => true,
                'parameters_json' => [
                    'maxFundSalaryCentavos' => PhPagIbigCalculator::MAX_FUND_SALARY_CENTAVOS,
                    'lowerThresholdCentavos' => PhPagIbigCalculator::LOWER_BRACKET_THRESHOLD_CENTAVOS,
                    'eeLowPct' => 1,
                    'eeStandardPct' => 2,
                    'erPct' => 2,
                ],
            ],
            [
                'rule_key' => PhBirWithholdingTaxCalculator::RULE_KEY,
                'agency' => 'BIR',
                'issuance_reference' => 'BIR RR No. 11-2018 Annex E Revised Tables (2023 onwards)',
                'official_url' => PhBirWithholdingTaxCalculator::OFFICIAL_URL,
                'effective_from' => PhBirWithholdingTaxCalculator::EFFECTIVE_FROM,
                'effective_to' => null,
                'is_active' => true,
                'parameters_json' => [
                    'frequenciesSupported' => ['Daily', 'Weekly', 'Semimonthly', 'Monthly'],
                    'mweExempt' => true,
                ],
            ],
        ];

        foreach ($rules as $rule) {
            PayrollStatutoryRuleVersion::query()->updateOrCreate(
                ['rule_key' => $rule['rule_key']],
                $rule,
            );
        }
    }
}
