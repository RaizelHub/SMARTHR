<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DevPayrollUserSeeder extends Seeder
{
    public function run(): void
    {
        $seedPassword = trim((string) env('DEMO_SEED_PASSWORD', ''));
        if ($seedPassword === '') {
            // Do not insert demo user accounts unless caller supplies DEMO_SEED_PASSWORD explicitly.
            return;
        }

        $accounts = [
            ['employee_code' => 'EMP-1001', 'full_name' => 'Jordan Taylor', 'work_email' => 'jordan.taylor@smarthr.demo', 'department' => 'Engineering', 'position' => 'Software Engineer', 'employment_status' => 'Active', 'assigned_role' => 'Employee', 'hire_date' => '2024-03-15'],
            ['employee_code' => 'EMP-1002', 'full_name' => 'Priya Nair', 'work_email' => 'priya.nair@smarthr.demo', 'department' => 'Human Resources', 'position' => 'HR Coordinator', 'employment_status' => 'Active', 'assigned_role' => 'HR Coordinator', 'hire_date' => '2023-08-01'],
            ['employee_code' => 'EMP-1003', 'full_name' => 'Marcus Chen', 'work_email' => 'marcus.chen@smarthr.demo', 'department' => 'Finance', 'position' => 'Financial Analyst', 'employment_status' => 'Probation', 'assigned_role' => 'Employee', 'hire_date' => '2026-01-12'],
            ['employee_code' => 'EMP-1004', 'full_name' => 'Dana Reyes', 'work_email' => 'dana.reyes@smarthr.demo', 'department' => 'Engineering', 'position' => 'Engineering Manager', 'employment_status' => 'Active', 'assigned_role' => 'Manager', 'hire_date' => '2022-05-20'],
            ['employee_code' => 'EMP-1005', 'full_name' => 'Alex Rivera', 'work_email' => 'alex.rivera@smarthr.demo', 'department' => 'Human Resources', 'position' => 'Director of People Operations', 'employment_status' => 'Active', 'assigned_role' => 'HR Admin', 'hire_date' => '2021-01-10'],
        ];

        $hashed = Hash::make($seedPassword);

        foreach ($accounts as $acct) {
            $user = User::query()->updateOrCreate(
                ['email' => $acct['work_email']],
                [
                    'name' => $acct['full_name'],
                    'password' => $hashed,
                ],
            );

            Employee::query()->updateOrCreate(
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
        }
    }
}
