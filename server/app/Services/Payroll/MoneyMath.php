<?php

namespace App\Services\Payroll;

use InvalidArgumentException;

final class MoneyMath
{
    public const MAX_SAFE_CENTAVOS = 100_000_000_000; // PHP 1,000,000,000.00

    public static function parsePhpToCentavos(string|int|float $raw): int
    {
        if (is_int($raw)) {
            $centavos = $raw * 100;
            if ($centavos < 0 || $centavos > self::MAX_SAFE_CENTAVOS) {
                throw new InvalidArgumentException('Amount is out of bounds.');
            }

            return $centavos;
        }

        $normalized = is_float($raw)
            ? number_format($raw, 2, '.', '')
            : str_replace(',', '', trim($raw));

        if ($normalized === '' || ! preg_match('/^(-)?(\d+)(?:\.(\d+))?$/', $normalized, $matches)) {
            throw new InvalidArgumentException('Enter a valid numeric PHP amount.');
        }

        if (($matches[1] ?? '') === '-') {
            throw new InvalidArgumentException('Amount cannot be negative.');
        }

        $whole = $matches[2];
        $frac = $matches[3] ?? '';
        if (strlen($frac) > 2) {
            throw new InvalidArgumentException('Amount cannot exceed 2 decimal places (centavos).');
        }

        $centavos = ((int) $whole * 100) + (int) str_pad($frac, 2, '0', STR_PAD_RIGHT);
        if ($centavos > self::MAX_SAFE_CENTAVOS) {
            throw new InvalidArgumentException('Amount exceeds maximum payroll limit.');
        }

        return $centavos;
    }

    public static function roundHalfUpDiv(int $numerator, int $denominator): int
    {
        if ($denominator <= 0) {
            throw new InvalidArgumentException('Denominator must be positive.');
        }

        $negative = $numerator < 0;
        $absNum = abs($numerator);
        $quotient = intdiv($absNum, $denominator);
        $remainder = $absNum % $denominator;

        if ($remainder * 2 >= $denominator) {
            $quotient++;
        }

        return $negative ? -$quotient : $quotient;
    }

    public static function percentOfCentavos(int $baseCentavos, float|int|string $ratePercent): int
    {
        // Convert percentage (e.g. 5, 10, 15, 2.5) to basis points (hundredths of a percent) cleanly as integer
        $rateStr = is_string($ratePercent) ? trim($ratePercent) : (string) $ratePercent;
        if (! preg_match('/^(\d+)(?:\.(\d+))?$/', $rateStr, $matches)) {
            throw new InvalidArgumentException('Rate percentage must be non-negative.');
        }

        $frac = $matches[2] ?? '';
        if (strlen($frac) > 2) {
            throw new InvalidArgumentException('Percentage precision exceeds 2 decimals.');
        }

        $basisPoints = ((int) $matches[1] * 100) + (int) str_pad($frac, 2, '0', STR_PAD_RIGHT);

        // baseCentavos * basisPoints / 10000 rounded half up using bcmath/integer safe scaling
        if (function_exists('bcmul') && PHP_INT_SIZE >= 8) {
            $product = $baseCentavos * $basisPoints;

            return self::roundHalfUpDiv($product, 10000);
        }

        return self::roundHalfUpDiv($baseCentavos * $basisPoints, 10000);
    }

    public static function multiplyHundredthsCentavos(int $rateCentavos, int $unitsHundredths): int
    {
        if ($rateCentavos < 0 || $unitsHundredths < 0) {
            throw new InvalidArgumentException('Rate and payable units must be non-negative.');
        }

        return self::roundHalfUpDiv($rateCentavos * $unitsHundredths, 100);
    }

    public static function formatPhp(int $centavos): string
    {
        $negative = $centavos < 0;
        $abs = abs($centavos);
        $whole = number_format(intdiv($abs, 100));
        $frac = str_pad((string) ($abs % 100), 2, '0', STR_PAD_LEFT);

        return ($negative ? '-' : '')."PHP {$whole}.{$frac}";
    }
}

