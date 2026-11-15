<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $activeEmployeesCount = Employee::query()
            ->where('employment_status', '!=', 'Inactive')
            ->count();

        $company = (array) config('smarthr.company', []);
        $license = (array) config('smarthr.license', []);

        return response()->json([
            'company' => [
                'name' => (string) ($company['name'] ?? 'Smart HR Organization'),
                'tradeName' => (string) ($company['trade_name'] ?? 'Smart HR'),
                'tin' => (string) ($company['tin'] ?? '000-000-000-000'),
                'sssEmployerNumber' => (string) ($company['sss_employer_number'] ?? '00-0000000-0'),
                'philhealthEmployerNumber' => (string) ($company['philhealth_employer_number'] ?? '00-000000000-0'),
                'pagibigEmployerNumber' => (string) ($company['pagibig_employer_number'] ?? '0000-0000-0000'),
                'address' => (string) ($company['address'] ?? 'Metro Manila, Philippines'),
                'businessTimezone' => (string) ($company['business_timezone'] ?? 'Asia/Manila'),
            ],
            'license' => [
                'status' => (string) ($license['status'] ?? 'active'),
                'plan' => (string) ($license['plan'] ?? 'Commercial Pilot Evaluation'),
                'customerId' => (string) ($license['customer_id'] ?? 'CUST-PILOT-001'),
                'maxEmployees' => (int) ($license['max_employees'] ?? 100),
                'activeEmployees' => $activeEmployeesCount,
                'expiresAt' => (string) ($license['expires_at'] ?? '2027-12-31'),
                'gracePeriodDays' => (int) ($license['grace_period_days'] ?? 14),
            ],
        ]);
    }
}
