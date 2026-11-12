import type { PhStatutoryPlaceholder } from '../../../types/payroll'

/**
 * PHASE 6B COMPLIANCE PLACEHOLDERS
 *
 * Automatic Philippine statutory payroll deductions and labor-premium rules are
 * intentionally DISABLED in Phase 6A. Do not activate automated calculations
 * until verified against current agency circulars, effective dates, salary
 * brackets/ceilings, EE/ER share splits, and approved company HR policies.
 */
export const PHILIPPINE_STATUTORY_PLACEHOLDERS: readonly PhStatutoryPlaceholder[] =
  [
    {
      agencyCode: 'SSS',
      agencyName: 'Social Security System (SSS)',
      scope: 'Employee & Employer Shares, EC Contribution, WISP / Mandatory Provident Fund',
      enabled: false,
      statusLabel: 'Disabled — Phase 6B Verification Required',
      officialUrl: 'https://www.sss.gov.ph/',
      requiredVerificationItems: [
        'Current effective SSS Circular and Monthly Salary Credit (MSC) bracket table',
        'Employee category applicability and covered compensation base definition',
        'Employee vs Employer share split, EC tier, and WISP threshold rules',
        'Proration across Monthly vs Semimonthly schedules & rounding confirmation',
      ],
    },
    {
      agencyCode: 'PHILHEALTH',
      agencyName: 'Philippine Health Insurance Corporation (PhilHealth)',
      scope: 'Direct Contributor Premium Rate, Floor/Ceiling, EE/ER 50-50 Split',
      enabled: false,
      statusLabel: 'Disabled — Phase 6B Verification Required',
      officialUrl: 'https://www.philhealth.gov.ph/',
      requiredVerificationItems: [
        'Current official PhilHealth circular effective premium rate and salary floor/ceiling',
        'Basic monthly salary base definition (excluding non-basic allowances)',
        'Employee/Employer centavo splitting and odd-centavo rounding policy',
      ],
    },
    {
      agencyCode: 'PAGIBIG',
      agencyName: 'Pag-IBIG Fund (HDMF)',
      scope: 'Mandatory Monthly Employee & Employer Fund Contributions',
      enabled: false,
      statusLabel: 'Disabled — Phase 6B Verification Required',
      officialUrl: 'https://www.pagibigfund.gov.ph/',
      requiredVerificationItems: [
        'Current HDMF circular monthly compensation cap and EE/ER percentage tiers',
        'Voluntary upgraded contribution opt-in handling (Phase 6B)',
      ],
    },
    {
      agencyCode: 'BIR',
      agencyName: 'Bureau of Internal Revenue (BIR)',
      scope: 'Withholding Tax on Compensation (Revised TRAIN Tables)',
      enabled: false,
      statusLabel: 'Disabled — Phase 6B Verification Required',
      officialUrl: 'https://www.bir.gov.ph/',
      requiredVerificationItems: [
        'BIR revised graduated withholding tax table aligned with pay frequency',
        'Non-taxable statutory deduction exclusion order (SSS + PhilHealth + Pag-IBIG)',
        'De minimis benefit ceilings and 13th month / annualized withholding rules',
      ],
    },
    {
      agencyCode: 'DOLE',
      agencyName: 'Department of Labor and Employment (DOLE)',
      scope: 'Overtime, Rest Day, Holiday Premiums, Night Shift Differential & Deductions',
      enabled: false,
      statusLabel: 'Disabled — Requires Company Policy & DOLE Review',
      officialUrl: 'https://www.dole.gov.ph/',
      requiredVerificationItems: [
        'Confirmed company work schedule, daily divisor factor, and shift schedules',
        'Regular/Special Non-Working Holiday, Overtime, and NSD approval workflows',
        'Permissible tardiness/undertime & unpaid leave deduction authorization policy',
      ],
    },
  ] as const

