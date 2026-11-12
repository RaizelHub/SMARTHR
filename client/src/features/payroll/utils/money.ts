/**
 * Exact integer-centavo monetary utilities for PHP currency (1 PHP = 100 centavos).
 * Zero binary floating-point arithmetic is used in authoritative money operations.
 */

export const MAX_SAFE_CENTAVOS = 1_000_000_000_00 // PHP 1,000,000,000.00
export const MAX_PAYABLE_UNITS_HUNDREDTHS = 100_000 // 1,000.00 units

const DECIMAL_AMOUNT_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/

export function parsePhpAmountToCentavos(raw: string | number): number {
  const normalized =
    typeof raw === 'number'
      ? Number.isFinite(raw)
        ? raw.toString()
        : ''
      : raw.trim().replace(/,/g, '')

  if (!normalized) {
    throw new RangeError('Amount is required.')
  }

  const match = DECIMAL_AMOUNT_PATTERN.exec(normalized)
  if (!match) {
    throw new RangeError('Enter a valid numeric PHP amount (up to 2 decimal places).')
  }

  const isNegative = Boolean(match[1])
  if (isNegative) {
    throw new RangeError('Amount cannot be negative.')
  }

  const wholePart = match[2]
  const fracPart = match[3] ?? ''

  if (fracPart.length > 2) {
    throw new RangeError('Amount cannot have more than 2 decimal places (centavos).')
  }

  const paddedFrac = fracPart.padEnd(2, '0')
  const wholeInt = Number.parseInt(wholePart, 10)
  const fracInt = Number.parseInt(paddedFrac, 10)

  if (!Number.isSafeInteger(wholeInt) || !Number.isSafeInteger(fracInt)) {
    throw new RangeError('Amount exceeds safe numeric limits.')
  }

  const totalCentavos = wholeInt * 100 + fracInt
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos > MAX_SAFE_CENTAVOS) {
    throw new RangeError('Amount exceeds maximum supported payroll limit.')
  }

  return totalCentavos
}

export function parseUnitsToHundredths(raw: string): number {
  const normalized = raw.trim().replace(/,/g, '')
  if (!normalized) {
    throw new RangeError('Payable units value is required.')
  }

  const match = DECIMAL_AMOUNT_PATTERN.exec(normalized)
  if (!match || match[1]) {
    throw new RangeError('Payable units must be a non-negative number (up to 2 decimals).')
  }

  const wholePart = match[2]
  const fracPart = match[3] ?? ''
  if (fracPart.length > 2) {
    throw new RangeError('Payable units support up to 2 decimal places.')
  }

  const hundredths =
    Number.parseInt(wholePart, 10) * 100 +
    Number.parseInt(fracPart.padEnd(2, '0'), 10)

  if (!Number.isSafeInteger(hundredths) || hundredths > MAX_PAYABLE_UNITS_HUNDREDTHS) {
    throw new RangeError('Payable units exceed maximum allowed period units (1,000.00).')
  }

  return hundredths
}

export function formatHundredths(hundredths: number): string {
  if (!Number.isSafeInteger(hundredths)) {
    throw new RangeError('Units value must be an integer.')
  }
  const abs = Math.abs(hundredths)
  const whole = Math.trunc(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${hundredths < 0 ? '-' : ''}${whole}.${frac}`
}

export function assertSafeCentavos(value: number, label = 'Amount'): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer centavo value.`)
  }
  return value
}

export function addCentavos(a: number, b: number): number {
  const sum = assertSafeCentavos(a, 'Left operand') + assertSafeCentavos(b, 'Right operand')
  if (!Number.isSafeInteger(sum)) {
    throw new RangeError('Centavo addition overflowed safe integer bounds.')
  }
  return sum
}

export function subtractCentavos(a: number, b: number): number {
  const diff = assertSafeCentavos(a, 'Left operand') - assertSafeCentavos(b, 'Right operand')
  if (!Number.isSafeInteger(diff)) {
    throw new RangeError('Centavo subtraction overflowed safe integer bounds.')
  }
  return diff
}

export function sumCentavos(values: readonly number[]): number {
  let total = 0
  for (const value of values) {
    total = addCentavos(total, value)
  }
  return total
}

/**
 * Deterministic Integer Half-Up Division (`ROUND_HALF_UP`):
 * Multiplies and rounds half-centavos away from zero using BigInt so large
 * intermediate products never overflow 53-bit integer precision.
 */
export function roundHalfUpDiv(numerator: number, denominator: number): number {
  assertSafeCentavos(numerator, 'Numerator')
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError('Denominator must be a positive safe integer.')
  }

  const bigNum = BigInt(numerator)
  const bigDen = BigInt(denominator)
  const isNeg = bigNum < 0n
  const absNum = isNeg ? -bigNum : bigNum

  const quotient = absNum / bigDen
  const remainder = absNum % bigDen
  const shouldRoundUp = remainder * 2n >= bigDen
  const roundedAbs = shouldRoundUp ? quotient + 1n : quotient
  const signed = isNeg ? -roundedAbs : roundedAbs
  const asNumber = Number(signed)

  if (!Number.isSafeInteger(asNumber)) {
    throw new RangeError('Rounded centavo result exceeds safe integer range.')
  }

  return asNumber
}

export function multiplyUnitsCentavos(
  ratePerUnitCentavos: number,
  unitsHundredths: number,
): number {
  assertSafeCentavos(ratePerUnitCentavos, 'Rate')
  if (!Number.isSafeInteger(unitsHundredths) || unitsHundredths < 0) {
    throw new RangeError('Payable units must be a non-negative integer in hundredths.')
  }

  const product = BigInt(ratePerUnitCentavos) * BigInt(unitsHundredths)
  const rounded = (product * 2n + 100n) / 200n
  const asNumber = Number(rounded)
  if (!Number.isSafeInteger(asNumber) || asNumber > MAX_SAFE_CENTAVOS) {
    throw new RangeError('Calculated unit compensation exceeds safe integer limit.')
  }
  return asNumber
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatPhpFromCentavos(centavos: number): string {
  assertSafeCentavos(centavos, 'Centavos')
  const isNegative = centavos < 0
  const abs = Math.abs(centavos)
  const whole = Math.trunc(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  const formatted = `PHP ${groupThousands(String(whole))}.${frac}`
  return isNegative ? `-${formatted}` : formatted
}

