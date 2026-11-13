<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\EmployeeCompensation;
use App\Models\LeaveDecisionLog;
use App\Models\LeaveRequest;
use App\Models\PayrollPeriod;
use App\Models\User;
use App\Services\Payroll\PayrollWorkflowService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class DevPayrollUserSeeder extends Seeder
{
    public function run(): void
    {
        $seedPassword = trim((string) env('DEMO_SEED_PASSWORD', ''));
        if ($seedPassword === '') {
            // Do not insert demo user accounts unless caller supplies DEMO_SEED_PASSWORD explicitly.
            return;
        }

        if (app()->environment('production')) {
            throw new RuntimeException('DevPayrollUserSeeder cannot be executed in a production environment.');
        }

        $accounts = [
            ['employee_code' => 'EMP-1001', 'full_name' => 'Jordan Taylor', 'work_email' => 'jordan.taylor@smarthr.demo', 'department' => 'Engineering', 'position' => 'Software Engineer', 'employment_status' => 'Active', 'assigned_role' => 'Employee', 'hire_date' => '2024-03-15'],
            ['employee_code' => 'EMP-1002', 'full_name' => 'Priya Nair', 'work_email' => 'priya.nair@smarthr.demo', 'department' => 'Human Resources', 'position' => 'HR Coordinator', 'employment_status' => 'Active', 'assigned_role' => 'HR Coordinator', 'hire_date' => '2023-08-01'],
            ['employee_code' => 'EMP-1003', 'full_name' => 'Marcus Chen', 'work_email' => 'marcus.chen@smarthr.demo', 'department' => 'Finance', 'position' => 'Financial Analyst', 'employment_status' => 'Probation', 'assigned_role' => 'Employee', 'hire_date' => '2026-01-12'],
            ['employee_code' => 'EMP-1004', 'full_name' => 'Dana Reyes', 'work_email' => 'dana.reyes@smarthr.demo', 'department' => 'Engineering', 'position' => 'Engineering Manager', 'employment_status' => 'Active', 'assigned_role' => 'Manager', 'hire_date' => '2022-05-20'],
            ['employee_code' => 'EMP-1005', 'full_name' => 'Alex Rivera', 'work_email' => 'alex.rivera@smarthr.demo', 'department' => 'Human Resources', 'position' => 'Director of People Operations', 'employment_status' => 'Active', 'assigned_role' => 'HR Admin', 'hire_date' => '2021-01-10'],
        ];

        $hashed = Hash::make($seedPassword);
        $createdEmployees = [];
        $adminUser = null;

        foreach ($accounts as $acct) {
            $user = User::query()->updateOrCreate(
                ['email' => $acct['work_email']],
                [
                    'name' => $acct['full_name'],
                    'password' => $hashed,
                ],
            );

            if ($acct['assigned_role'] === 'HR Admin') {
                $adminUser = $user;
            }

            $emp = Employee::query()->updateOrCreate(
                ['employee_code' => $acct['employee_code']],
                [
                    'user_id' => $user->id,
                    'full_name' => $acct['full_name'],
                    'work_email' => $acct['work_email'],
                    'department' => $acct['department'],
                    'position' => $acct['position'],
                    'employment_status' => $acct['employment_status'],
                    'assigned_role' => $acct['assigned_role'],
                    'is_minimum_wage_earner' => false,
                    'hire_date' => $acct['hire_date'],
                ],
            );

            $createdEmployees[$acct['employee_code']] = $emp;
        }

        // Seed synthetic compensation packages
        $compensations = [
            'EMP-1001' => ['basis' => 'Monthly', 'baseCentavos' => 4500000, 'allowances' => [['name' => 'Rice Subsidy', 'amountCentavos' => 200000, 'taxable' => false]]],
            'EMP-1002' => ['basis' => 'Monthly', 'baseCentavos' => 3800000, 'allowances' => [['name' => 'Communication Allowance', 'amountCentavos' => 150000, 'taxable' => false]]],
            'EMP-1004' => ['basis' => 'Monthly', 'baseCentavos' => 7500000, 'allowances' => [['name' => 'Leadership Allowance', 'amountCentavos' => 500000, 'taxable' => true]]],
            'EMP-1005' => ['basis' => 'Monthly', 'baseCentavos' => 9500000, 'allowances' => [['name' => 'Executive Allowance', 'amountCentavos' => 1000000, 'taxable' => true]]],
        ];

        foreach ($compensations as $code => $spec) {
            $emp = $createdEmployees[$code] ?? null;
            if ($emp) {
                EmployeeCompensation::query()->updateOrCreate(
                    [
                        'employee_id' => $emp->id,
                        'status' => 'Active',
                    ],
                    [
                        'pay_basis' => $spec['basis'],
                        'base_amount_centavos' => $spec['baseCentavos'],
                        'currency' => 'PHP',
                        'allowances_json' => $spec['allowances'],
                        'statutory_eligible' => true,
                        'effective_date' => '2026-01-01',
                        'end_date' => null,
                        'notes' => 'Synthetic demo compensation record',
                        'created_by_user_id' => $adminUser?->id,
                    ],
                );
            }
        }

        // Seed synthetic attendance sessions (yesterday completed shift for Jordan Taylor & Dana Reyes)
        $todayManila = CarbonImmutable::now('Asia/Manila');
        $yesterdayDate = $todayManila->subDays(1)->format('Y-m-d');

        if (isset($createdEmployees['EMP-1001'])) {
            $jordan = $createdEmployees['EMP-1001'];
            Attendance::query()->firstOrCreate(
                [
                    'employee_id' => $jordan->id,
                    'attendance_date' => $yesterdayDate,
                ],
                [
                    'clock_in_at_utc' => CarbonImmutable::parse("{$yesterdayDate} 09:00:00", 'Asia/Manila')->setTimezone('UTC'),
                    'clock_out_at_utc' => CarbonImmutable::parse("{$yesterdayDate} 18:00:00", 'Asia/Manila')->setTimezone('UTC'),
                    'duration_minutes' => 540,
                    'status' => 'Clocked Out',
                    'business_timezone' => 'Asia/Manila',
                    'notes' => 'Synthetic demo attendance session',
                ],
            );
        }

        // Seed synthetic leave requests (EMP-1001 approved vacation, EMP-1003 pending sick leave)
        if (isset($createdEmployees['EMP-1001'])) {
            $jordan = $createdEmployees['EMP-1001'];
            $leaveStart = $todayManila->addDays(7)->format('Y-m-d');
            $leaveEnd = $todayManila->addDays(8)->format('Y-m-d');

            $approvedLeave = LeaveRequest::query()->firstOrCreate(
                [
                    'employee_id' => $jordan->id,
                    'start_date' => $leaveStart,
                ],
                [
                    'leave_type' => 'Vacation',
                    'end_date' => $leaveEnd,
                    'total_days' => 2,
                    'reason' => 'Annual family vacation leave',
                    'status' => 'Approved',
                    'reviewed_by_user_id' => $adminUser?->id,
                    'reviewed_at_utc' => CarbonImmutable::now('UTC'),
                    'reviewer_note' => 'Approved per department schedule.',
                ],
            );

            LeaveDecisionLog::query()->firstOrCreate(
                [
                    'leave_request_id' => $approvedLeave->id,
                    'action' => 'Approved',
                ],
                [
                    'actor_user_id' => $adminUser?->id,
                    'actor_employee_code' => 'EMP-1005',
                    'actor_name' => 'Alex Rivera',
                    'actor_role' => 'HR Admin',
                    'note' => 'Approved per department schedule.',
                    'occurred_at_utc' => CarbonImmutable::now('UTC'),
                ],
            );
        }

        if (isset($createdEmployees['EMP-1003'])) {
            $marcus = $createdEmployees['EMP-1003'];
            $sickStart = $todayManila->addDays(2)->format('Y-m-d');
            LeaveRequest::query()->firstOrCreate(
                [
                    'employee_id' => $marcus->id,
                    'start_date' => $sickStart,
                ],
                [
                    'leave_type' => 'Sick',
                    'end_date' => $sickStart,
                    'total_days' => 1,
                    'reason' => 'Medical appointment',
                    'status' => 'Pending',
                    'reviewed_by_user_id' => null,
                    'reviewed_at_utc' => null,
                    'reviewer_note' => null,
                ],
            );
        }

        // Seed synthetic payroll period with calculated draft entries
        if ($adminUser) {
            $periodStart = $todayManila->startOfMonth()->format('Y-m-d');
            $periodEnd = $todayManila->startOfMonth()->addDays(14)->format('Y-m-d');
            $payDate = $periodEnd;

            $period = PayrollPeriod::query()->firstOrCreate(
                [
                    'label' => "Semimonthly Run {$periodStart}",
                ],
                [
                    'schedule_type' => 'Semimonthly',
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'pay_date' => $payDate,
                    'status' => 'Draft',
                    'version' => 1,
                ],
            );

            if ($period->entries()->count() === 0) {
                app(PayrollWorkflowService::class)->generateAndCalculate(
                    $period,
                    $adminUser,
                    '127.0.0.1',
                );
            }
        }
    }
}
