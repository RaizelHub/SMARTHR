<?php

namespace Tests\Unit;

use App\Services\Payroll\MoneyMath;
use App\Services\Payroll\Statutory\PhBirWithholdingTaxCalculator;
use App\Services\Payroll\Statutory\PhPagIbigCalculator;
use App\Services\Payroll\Statutory\PhPhilHealthCalculator;
use App\Services\Payroll\Statutory\PhSssCalculator;
use Tests\TestCase;

class PhStatutoryCalculatorsTest extends TestCase
{
    public function test_exact_centavo_money_math_avoids_float_drift(): void
    {
        $a = MoneyMath::parsePhpToCentavos('0.10');
        $b = MoneyMath::parsePhpToCentavos('0.20');
        $this->assertSame(MoneyMath::parsePhpToCentavos('0.30'), $a + $b);

        $this->assertSame(1250001, MoneyMath::roundHalfUpDiv(2500001, 2));
        $this->assertSame(893025, MoneyMath::multiplyHundredthsCentavos(85050, 1050));
        $this->assertSame('PHP 12,500.01', MoneyMath::formatPhp(1250001));
    }

    public function test_sss_circular_2024_006_brackets_ec_threshold_and_effective_date_safety(): void
    {
        $sss = new PhSssCalculator;

        // Pre-2025 safety block
        $pre2025 = $sss->calculateMonthly(2_500_000, '2024-12-31');
        $this->assertFalse($pre2025['applied']);
        $this->assertSame(0, $pre2025['employeeTotalCentavos']);
        $this->assertNotNull($pre2025['warning']);

        // Below minimum bracket (< PHP 5,250 -> MSC PHP 5,000, EC PHP 10)
        $min = $sss->calculateMonthly(450_000, '2026-11-15');
        $this->assertTrue($min['applied']);
        $this->assertSame(500_000, $min['mscCentavos']);
        $this->assertSame(25_000, $min['employeeTotalCentavos']); // PHP 250
        $this->assertSame(51_000, $min['employerTotalCentavos']); // PHP 500 + PHP 10 EC
        $this->assertSame(1_000, $min['employerEcCentavos']);

        // EC boundary: MSC PHP 14,500 -> EC PHP 10 vs MSC PHP 15,000 -> EC PHP 30
        $at14500 = $sss->calculateMonthly(1_450_000, '2026-11-15');
        $this->assertSame(1_450_000, $at14500['mscCentavos']);
        $this->assertSame(1_000, $at14500['employerEcCentavos']);

        $at15000 = $sss->calculateMonthly(1_500_000, '2026-11-15');
        $this->assertSame(1_500_000, $at15000['mscCentavos']);
        $this->assertSame(75_000, $at15000['employeeTotalCentavos']); // PHP 750
        $this->assertSame(3_000, $at15000['employerEcCentavos']); // PHP 30

        // WISP bracket (PHP 25,000 MSC -> PHP 20k Regular + PHP 5k WISP)
        $at25000 = $sss->calculateMonthly(2_500_000, '2026-11-15');
        $this->assertSame(2_000_000, $at25000['regularSsMscCentavos']);
        $this->assertSame(500_000, $at25000['wispMscCentavos']);
        $this->assertSame(125_000, $at25000['employeeTotalCentavos']); // PHP 1,250
        $this->assertSame(253_000, $at25000['employerTotalCentavos']); // PHP 2,500 + PHP 30 EC

        // Ceiling (>= PHP 34,750 -> MSC PHP 35,000)
        $max = $sss->calculateMonthly(8_000_000, '2026-11-15');
        $this->assertSame(3_500_000, $max['mscCentavos']);
        $this->assertSame(175_000, $max['employeeTotalCentavos']); // PHP 1,750
        $this->assertSame(353_000, $max['employerTotalCentavos']); // PHP 3,500 + PHP 30 EC
    }

    public function test_philhealth_floor_ceiling_and_50_50_split(): void
    {
        $ph = new PhPhilHealthCalculator;

        // Floor clamping: PHP 8,000 -> PHP 10,000 = PHP 500 total (PHP 250 EE / PHP 250 ER)
        $floor = $ph->calculateMonthly(800_000, '2026-11-15');
        $this->assertSame(1_000_000, $floor['basisMbsCentavos']);
        $this->assertSame(50_000, $floor['totalMonthlyCentavos']);
        $this->assertSame(25_000, $floor['employeeMonthlyCentavos']);
        $this->assertSame(25_000, $floor['employerMonthlyCentavos']);

        // Standard: PHP 30,000 * 5% = PHP 1,500 total (PHP 750 EE / PHP 750 ER)
        $mid = $ph->calculateMonthly(3_000_000, '2026-11-15');
        $this->assertSame(150_000, $mid['totalMonthlyCentavos']);
        $this->assertSame(75_000, $mid['employeeMonthlyCentavos']);
        $this->assertSame(75_000, $mid['employerMonthlyCentavos']);

        // Ceiling clamping: PHP 150,000 -> PHP 100,000 = PHP 5,000 total (PHP 2,500 EE / PHP 2,500 ER)
        $ceiling = $ph->calculateMonthly(15_000_000, '2026-11-15');
        $this->assertSame(10_000_000, $ceiling['basisMbsCentavos']);
        $this->assertSame(250_000, $ceiling['employeeMonthlyCentavos']);
        $this->assertSame(250_000, $ceiling['employerMonthlyCentavos']);
    }

    public function test_pagibig_circular_460_lower_bracket_and_maximum_fund_salary(): void
    {
        $pagIbig = new PhPagIbigCalculator;

        // <= PHP 1,500: 1% EE / 2% ER
        $low = $pagIbig->calculateMonthly(150_000, '2026-11-15');
        $this->assertSame(1_500, $low['employeeMonthlyCentavos']); // PHP 15
        $this->assertSame(3_000, $low['employerMonthlyCentavos']); // PHP 30

        // PHP 5,000: 2% EE / 2% ER = PHP 100 each
        $mid = $pagIbig->calculateMonthly(500_000, '2026-11-15');
        $this->assertSame(10_000, $mid['employeeMonthlyCentavos']);
        $this->assertSame(10_000, $mid['employerMonthlyCentavos']);

        // >= PHP 10,000 MFS cap: PHP 200 EE / PHP 200 ER
        $cap = $pagIbig->calculateMonthly(4_500_000, '2026-11-15');
        $this->assertSame(1_000_000, $cap['fundSalaryBasisCentavos']);
        $this->assertSame(20_000, $cap['employeeMonthlyCentavos']);
        $this->assertSame(20_000, $cap['employerMonthlyCentavos']);
    }

    public function test_bir_2023_annex_e_monthly_semimonthly_and_mwe_exemption(): void
    {
        $bir = new PhBirWithholdingTaxCalculator;

        // Monthly PHP 20,833 -> PHP 0.00 (Bracket 1)
        $b1 = $bir->calculate(2_083_300, 'Monthly', '2026-11-15', false);
        $this->assertSame(0, $b1['withholdingTaxCentavos']);

        // Monthly PHP 25,000 -> (25,000 - 20,833) * 15% = 4,167 * 0.15 = PHP 625.05
        $b2 = $bir->calculate(2_500_000, 'Monthly', '2026-11-15', false);
        $this->assertSame(62_505, $b2['withholdingTaxCentavos']);

        // Monthly PHP 50,000 -> 1,875.00 + (50,000 - 33,333) * 20% = 1,875 + 3,333.40 = PHP 5,208.40
        $b3 = $bir->calculate(5_000_000, 'Monthly', '2026-11-15', false);
        $this->assertSame(520_840, $b3['withholdingTaxCentavos']);

        // Semimonthly PHP 25,000 -> 937.50 + (25,000 - 16,667) * 20% = 937.50 + 1,666.60 = PHP 2,604.10
        $semi = $bir->calculate(2_500_000, 'Semimonthly', '2026-11-15', false);
        $this->assertSame(260_410, $semi['withholdingTaxCentavos']);

        // Statutory Minimum Wage Earner -> Exempt PHP 0.00 regardless of supplemental check
        $mwe = $bir->calculate(2_500_000, 'Monthly', '2026-11-15', true);
        $this->assertSame(0, $mwe['withholdingTaxCentavos']);
    }
}

