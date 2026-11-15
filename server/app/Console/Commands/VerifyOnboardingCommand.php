<?php

namespace App\Console\Commands;

use App\Models\Employee;
use App\Models\PayrollStatutoryRuleVersion;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class VerifyOnboardingCommand extends Command
{
    protected $signature = 'smarthr:verify-onboarding';

    protected $description = 'Verify customer instance readiness across the 7-point onboarding checklist.';

    public function handle(): int
    {
        $this->info('====================================================');
        $this->info('  Smart HR — Customer Onboarding Pre-Flight Check   ');
        $this->info('====================================================');
        $this->newLine();

        $rows = [];
        $hasFailure = false;

        // 1. Database Connectivity
        try {
            DB::select('select 1');
            $rows[] = ['1. Database Connection', 'Connected and responsive', 'PASS'];
        } catch (Throwable $e) {
            $rows[] = ['1. Database Connection', 'Failed: '.$e->getMessage(), 'FAIL'];
            $hasFailure = true;
        }

        // 2. Essential Table Migrations
        $requiredTables = [
            'users',
            'employees',
            'employee_compensations',
            'payroll_periods',
            'payroll_entries',
            'attendances',
            'leave_requests',
            'security_audit_logs',
            'payroll_statutory_rule_versions',
        ];
        $missingTables = [];
        foreach ($requiredTables as $table) {
            if (! Schema::hasTable($table)) {
                $missingTables[] = $table;
            }
        }
        if (empty($missingTables)) {
            $rows[] = ['2. Database Schema', 'All 9 core tables verified', 'PASS'];
        } else {
            $rows[] = ['2. Database Schema', 'Missing tables: '.implode(', ', $missingTables), 'FAIL'];
            $hasFailure = true;
        }

        // 3. Statutory Calculation Rules
        try {
            $activeRulesCount = Schema::hasTable('payroll_statutory_rule_versions')
                ? PayrollStatutoryRuleVersion::query()->where('is_active', true)->count()
                : 0;

            if ($activeRulesCount >= 4) {
                $rows[] = ['3. Statutory Rule Versions', "{$activeRulesCount} active rules (SSS, PhilHealth, Pag-IBIG, BIR)", 'PASS'];
            } else {
                $rows[] = ['3. Statutory Rule Versions', "Only {$activeRulesCount} active rules. Run: php artisan db:seed --class=StatutoryRuleSeeder", 'FAIL'];
                $hasFailure = true;
            }
        } catch (Throwable $e) {
            $rows[] = ['3. Statutory Rule Versions', 'Error checking rules: '.$e->getMessage(), 'FAIL'];
            $hasFailure = true;
        }

        // 4. Active HR Administrator Account
        try {
            $activeAdminsCount = Schema::hasTable('employees')
                ? Employee::query()->where('assigned_role', 'HR Admin')->where('employment_status', 'Active')->count()
                : 0;

            if ($activeAdminsCount >= 1) {
                $rows[] = ['4. Administrator Account', "{$activeAdminsCount} active HR Admin account(s) provisioned", 'PASS'];
            } else {
                $rows[] = ['4. Administrator Account', 'No active HR Admin account found. Organization lockout risk.', 'FAIL'];
                $hasFailure = true;
            }
        } catch (Throwable $e) {
            $rows[] = ['4. Administrator Account', 'Error checking admin accounts: '.$e->getMessage(), 'FAIL'];
            $hasFailure = true;
        }

        // 5. Business Timezone Configuration
        $businessTimezone = config('smarthr.company.business_timezone', 'Asia/Manila');
        $appTimezone = config('app.timezone', 'UTC');
        if ($businessTimezone === 'Asia/Manila' && $appTimezone === 'UTC') {
            $rows[] = ['5. Timezone Alignment', "Storage: {$appTimezone} · Display: {$businessTimezone}", 'PASS'];
        } else {
            $rows[] = ['5. Timezone Alignment', "Unexpected config. APP_TIMEZONE={$appTimezone}, Business={$businessTimezone}", 'FAIL'];
            $hasFailure = true;
        }

        // 6. Storage Permissions
        $storageWritable = is_writable(storage_path('framework/views')) && is_writable(storage_path('logs'));
        if ($storageWritable) {
            $rows[] = ['6. Storage Permissions', 'Storage and view cache paths writable', 'PASS'];
        } else {
            $rows[] = ['6. Storage Permissions', 'storage/ directory is not writable by web process', 'FAIL'];
            $hasFailure = true;
        }

        // 7. Company & License Configuration
        $companyName = config('smarthr.company.name');
        $plan = config('smarthr.license.plan');
        if (! empty($companyName) && ! empty($plan)) {
            $rows[] = ['7. Company & License Info', "Org: {$companyName} · Plan: {$plan}", 'PASS'];
        } else {
            $rows[] = ['7. Company & License Info', 'SMARTHR_COMPANY_NAME or SMARTHR_LICENSE_PLAN missing', 'FAIL'];
            $hasFailure = true;
        }

        $this->table(['Check Item', 'Verification Detail', 'Status'], $rows);
        $this->newLine();

        if ($hasFailure) {
            $this->error('Pre-flight check FAILED. Please remediate the issues flagged above before customer handover.');

            return self::FAILURE;
        }

        $this->info('All pre-flight onboarding checks PASSED. System is ready for customer handover.');

        return self::SUCCESS;
    }
}
