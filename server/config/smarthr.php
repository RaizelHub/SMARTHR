<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Smart HR Company & Organization Profile
    |--------------------------------------------------------------------------
    |
    | Stores statutory organization identifiers for the customer deployment.
    | These values are surfaced on official payslips, reports, and onboarding.
    |
    */
    'company' => [
        'name' => env('SMARTHR_COMPANY_NAME', 'Smart HR Organization'),
        'trade_name' => env('SMARTHR_COMPANY_TRADE_NAME', 'Smart HR'),
        'tin' => env('SMARTHR_COMPANY_TIN', '000-000-000-000'),
        'sss_employer_number' => env('SMARTHR_SSS_EMPLOYER_NO', '00-0000000-0'),
        'philhealth_employer_number' => env('SMARTHR_PHILHEALTH_EMPLOYER_NO', '00-000000000-0'),
        'pagibig_employer_number' => env('SMARTHR_PAGIBIG_EMPLOYER_NO', '0000-0000-0000'),
        'address' => env('SMARTHR_COMPANY_ADDRESS', 'Metro Manila, Philippines'),
        'business_timezone' => 'Asia/Manila',
    ],

    /*
    |--------------------------------------------------------------------------
    | Smart HR Commercial License & Subscription Configuration
    |--------------------------------------------------------------------------
    |
    | Details the active customer license parameters and seat limits.
    |
    */
    'license' => [
        'status' => env('SMARTHR_LICENSE_STATUS', 'active'),
        'plan' => env('SMARTHR_LICENSE_PLAN', 'Commercial Pilot Evaluation'),
        'customer_id' => env('SMARTHR_CUSTOMER_ID', 'CUST-PILOT-001'),
        'max_employees' => (int) env('SMARTHR_MAX_EMPLOYEES', 100),
        'expires_at' => env('SMARTHR_LICENSE_EXPIRES_AT', '2027-12-31'),
        'grace_period_days' => 14,
    ],
];
