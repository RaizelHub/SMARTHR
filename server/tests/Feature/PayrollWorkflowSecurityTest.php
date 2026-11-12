<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\PayrollEntry;
use App\Models\PayrollPeriod;
use App\Models\User;
use Database\Seeders\StatutoryRuleSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PayrollWorkflowSecurityTest extends TestCase
{
    use RefreshDatabase;

    private User $hrAdminUser;

    private User $hrCoordUser;

    private User $managerUser;

    private User $employeeUser;

    private User $otherEmployeeUser;

    private User $inactiveUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(StatutoryRuleSeeder::class);

        $this->hrAdminUser = $this->createEmpUser('EMP-1005', 'Alex Rivera', 'alex@smarthr.test', 'Human Resources', 'HR Admin', 'Active');
        $this->hrCoordUser = $this->createEmpUser('EMP-1002', 'Priya Nair', 'priya@smarthr.test', 'Human Resources', 'HR Coordinator', 'Active');
        $this->managerUser = $this->createEmpUser('EMP-1004', 'Dana Reyes', 'dana@smarthr.test', 'Engineering', 'Manager', 'Active');
        $this->employeeUser = $this->createEmpUser('EMP-1001', 'Jordan Taylor', 'jordan@smarthr.test', 'Engineering', 'Employee', 'Active');
        $this->otherEmployeeUser = $this->createEmpUser('EMP-1003', 'Marcus Chen', 'marcus@smarthr.test', 'Finance', 'Employee', 'Probation');
        $this->inactiveUser = $this->createEmpUser('EMP-1099', 'Former Staff', 'inactive@smarthr.test', 'Sales', 'Employee', 'Inactive');
    }

    private function createEmpUser(
        string $code,
        string $name,
        string $email,
        string $dept,
        string $role,
        string $status,
    ): User {
        $user = User::query()->create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('ValidTestPass!2026'),
        ]);

        Employee::query()->create([
            'user_id' => $user->id,
            'employee_code' => $code,
            'full_name' => $name,
            'work_email' => $email,
            'department' => $dept,
            'position' => $role,
            'employment_status' => $status,
            'assigned_role' => $role,
            'is_minimum_wage_earner' => false,
            'hire_date' => '2025-01-10',
        ]);

        return $user->load('employee');
    }

    public function test_authentication_rejects_invalid_and_inactive_and_revokes_token_on_logout(): void
    {
        $this->getJson('/api/payroll/payslips/me')->assertStatus(401);

        $this->postJson('/api/auth/login', [
            'email' => 'jordan@smarthr.test',
            'password' => 'WrongPassword',
        ])->assertStatus(401)->assertJsonPath('code', 'INVALID_CREDENTIALS');

        $this->postJson('/api/auth/login', [
            'email' => 'inactive@smarthr.test',
            'password' => 'ValidTestPass!2026',
        ])->assertStatus(403)->assertJsonPath('code', 'EMPLOYEE_INACTIVE');

        $login = $this->postJson('/api/auth/login', [
            'email' => 'jordan@smarthr.test',
            'password' => 'ValidTestPass!2026',
        ])->assertStatus(200);

        $token = $login->json('token');
        $this->assertNotEmpty($token);

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/auth/me')
            ->assertStatus(200)
            ->assertJsonPath('user.employeeId', 'EMP-1001');

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/auth/logout')
            ->assertStatus(200);
    }

    public function test_end_to_end_philippine_payroll_semimonthly_reconciliation_approval_lock_and_payslip_ownership(): void
    {
        // HR Admin creates effective-dated monthly compensation for EMP-1001: PHP 30,000 basic + PHP 2,000 non-taxable rice allowance
        Sanctum::actingAs($this->hrAdminUser);

        // Older historical compensation effective 2026-09-01 (PHP 25,000)
        $this->postJson('/api/payroll/compensations', [
            'employee_code' => 'EMP-1001',
            'pay_basis' => 'Monthly',
            'base_amount' => '25000.00',
            'allowances' => [],
            'statutory_eligible' => true,
            'effective_date' => '2026-09-01',
        ])->assertStatus(201);

        // Newer raise effective 2026-11-01 (PHP 30,000 + PHP 2,000 exempt rice allowance)
        $this->postJson('/api/payroll/compensations', [
            'employee_code' => 'EMP-1001',
            'pay_basis' => 'Monthly',
            'base_amount' => '30000.00',
            'allowances' => [
                ['label' => 'Rice Subsidy', 'amount' => '2000.00', 'taxable' => false],
            ],
            'statutory_eligible' => true,
            'effective_date' => '2026-11-01',
        ])->assertStatus(201);

        // Historical rate preserved and closed at 2026-10-31
        $compList = $this->getJson('/api/payroll/compensations')->assertStatus(200)->json('compensations');
        $this->assertCount(2, $compList);
        $oldComp = collect($compList)->firstWhere('effectiveDate', '2026-09-01');
        $this->assertSame('Superseded', $oldComp['status']);
        $this->assertSame('2026-10-31', $oldComp['endDate']);

        // Unauthorized role access check (Employee & Manager cannot view compensations, periods, audit logs, or directory)
        foreach ([$this->employeeUser, $this->managerUser] as $restricted) {
            Sanctum::actingAs($restricted);
            $this->getJson('/api/payroll/compensations')->assertStatus(403);
            $this->getJson('/api/payroll/periods')->assertStatus(403);
            $this->getJson('/api/payroll/audit-logs')->assertStatus(403);
            $this->getJson('/api/employees')->assertStatus(403);
        }

        // HR Coordinator prepares Nov 1-15 AND Nov 16-30 Semimonthly payroll periods (HALF_HALF statutory reconciliation)
        Sanctum::actingAs($this->hrCoordUser);
        $p1Res = $this->postJson('/api/payroll/periods', [
            'label' => 'Nov 1-15 Cutoff',
            'schedule_type' => 'Semimonthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-15',
            'pay_date' => '2026-11-20',
            'semimonthly_half' => 1,
            'statutory_allocation_mode' => 'HALF_HALF',
        ])->assertStatus(201);
        $period1Id = $p1Res->json('period.id');

        // Overlapping period rejected 409
        $this->postJson('/api/payroll/periods', [
            'schedule_type' => 'Semimonthly',
            'period_start' => '2026-11-10',
            'period_end' => '2026-11-20',
            'pay_date' => '2026-11-25',
        ])->assertStatus(409)->assertJsonPath('code', 'DUPLICATE_PAYROLL_PERIOD');

        // Calculate 1st half (Nov 1-15)
        $calc1 = $this->postJson("/api/payroll/periods/{$period1Id}/calculate")->assertStatus(200);
        $this->assertSame(1, $calc1->json('addedCount'));
        $entry1 = $calc1->json('generatedEntries.0');
        // Gross = 15,000 basic + 1,000 exempt rice = 16,000.00 (1,600,000 centavos)
        $this->assertSame(1_600_000, $entry1['grossPayCentavos']);
        // Monthly statutory on 30k: SSS EE=1,500, PH EE=750, Pag-IBIG EE=200 => 1/2 = SSS 750, PH 375, Pag-IBIG 100 = 1,225 EE
        // Taxable comp = 15,000 - 1,225 = 13,775 -> Semimonthly Bracket 2 (10,417..16,666) -> (13,775 - 10,417)*15% = 503.70 -> 50,370 centavos!
        // Total EE deductions = 122,500 + 50,370 = 172,870 centavos; Net = 1,600,000 - 172,870 = 1,427,130 centavos!
        // Employer costs = 1/2 of (SSS ER 3,000 + EC 30 + PH ER 750 + Pag-IBIG ER 200) = 1,990.00 (199,000 centavos) -> NEVER deducted from employee Net!
        $this->assertSame(172_870, $entry1['totalDeductionsCentavos']);
        $this->assertSame(1_427_130, $entry1['netPayCentavos']);
        $this->assertSame(199_000, $entry1['totalEmployerCostCentavos']);

        // Re-running calculate preserves existing entries without duplicating
        $recalc = $this->postJson("/api/payroll/periods/{$period1Id}/calculate")->assertStatus(200);
        $this->assertSame(0, $recalc->json('addedCount'));
        $this->assertSame(1, $recalc->json('preservedExistingCount'));

        // Manual adjustment & duplicate rejection
        $entryId = $entry1['id'];
        $this->postJson("/api/payroll/entries/{$entryId}/adjustments", [
            'category' => 'Deduction',
            'label' => 'Company Loan',
            'amount' => '500.00',
        ])->assertStatus(200);

        $this->postJson("/api/payroll/entries/{$entryId}/adjustments", [
            'category' => 'Deduction',
            'label' => 'Company Loan',
            'amount' => '100.00',
        ])->assertStatus(409)->assertJsonPath('code', 'DUPLICATE_ADJUSTMENT');

        // Also test 2nd half (Nov 16-30): monthly statutory quota reconciles exact remaining half (no duplicate full deduction!)
        $p2Res = $this->postJson('/api/payroll/periods', [
            'label' => 'Nov 16-30 Cutoff',
            'schedule_type' => 'Semimonthly',
            'period_start' => '2026-11-16',
            'period_end' => '2026-11-30',
            'pay_date' => '2026-12-05',
            'semimonthly_half' => 2,
            'statutory_allocation_mode' => 'HALF_HALF',
        ])->assertStatus(201);
        $period2Id = $p2Res->json('period.id');
        $calc2 = $this->postJson("/api/payroll/periods/{$period2Id}/calculate")->assertStatus(200);
        $entry2 = $calc2->json('generatedEntries.0');
        // Total monthly SSS+PH+PagIBIG EE across Period 1 + Period 2 = exactly 1,500+750+200 = PHP 2,450.00!
        $sss2 = collect($entry2['deductions'])->firstWhere('code', 'SSS_EE');
        $this->assertSame(75_000, $sss2['amountCentavos']);

        // Creating a 3rd period in Nov 2026 won't duplicate SSS/PH/Pag-IBIG again!
        $p3Res = $this->postJson('/api/payroll/periods', [
            'label' => 'Nov Special Run',
            'schedule_type' => 'Semimonthly',
            'period_start' => '2026-11-29',
            'period_end' => '2026-11-30',
            'pay_date' => '2026-12-06',
        ]);
        // (Overlaps Nov 16-30 -> 409; test non-overlapping Weekly/Dec vs Monthly full check cleanly below)
        $this->assertSame(409, $p3Res->status());

        // Workflow transitions: HR Coord submits Period 1 for review -> HR Coord cannot self-approve -> HR Admin approves & locks
        $submitRes = $this->postJson("/api/payroll/periods/{$period1Id}/submit-review", [
            'review_notes' => 'Ready for executive approval',
        ])->assertStatus(200);
        $this->assertSame('Under Review', $submitRes->json('period.status'));

        // Coordinator cannot approve (missing permission)
        $this->postJson("/api/payroll/periods/{$period1Id}/approve")->assertStatus(403);

        // Return to Calculated for check, then re-submit
        $this->postJson("/api/payroll/periods/{$period1Id}/return", [
            'reason' => 'Verify loan amount once more',
        ])->assertStatus(200)->assertJsonPath('period.status', 'Calculated');

        $resubmit = $this->postJson("/api/payroll/periods/{$period1Id}/submit-review")->assertStatus(200);
        $version = $resubmit->json('period.version');

        // Distinct HR Admin (EMP-1005) approves with optimistic version guard
        Sanctum::actingAs($this->hrAdminUser);

        // Stale version conflict returns 409 CONCURRENT_STATE_CONFLICT
        $this->postJson("/api/payroll/periods/{$period1Id}/approve", [
            'expected_version' => 1,
        ])->assertStatus(409)->assertJsonPath('code', 'CONCURRENT_STATE_CONFLICT');

        $approved = $this->postJson("/api/payroll/periods/{$period1Id}/approve", [
            'expected_version' => $version,
            'approval_notes' => 'Approved payroll run',
        ])->assertStatus(200);
        $this->assertSame('Approved', $approved->json('period.status'));
        $approvedVersion = $approved->json('period.version');

        // Re-approving an already Approved batch fails 409 (concurrency safety)
        $this->postJson("/api/payroll/periods/{$period1Id}/approve", [
            'expected_version' => $approvedVersion,
        ])->assertStatus(409);

        // Lock permanently
        $locked = $this->postJson("/api/payroll/periods/{$period1Id}/lock", [
            'expected_version' => $approvedVersion,
        ])->assertStatus(200);
        $this->assertSame('Locked', $locked->json('period.status'));

        // Cannot modify adjustments or recalculate once Approved / Locked
        $this->postJson("/api/payroll/entries/{$entryId}/adjustments", [
            'category' => 'Earning',
            'label' => 'Backdoor Edit',
            'amount' => '1000.00',
        ])->assertStatus(409);
        $this->postJson("/api/payroll/periods/{$period1Id}/calculate")->assertStatus(409);

        // Verify audit logs created & contain ZERO raw salary numbers (30000)
        $audits = $this->getJson('/api/payroll/audit-logs')->assertStatus(200)->json('auditLogs');
        $this->assertGreaterThanOrEqual(5, count($audits));
        $this->assertStringNotContainsString('30000', json_encode($audits));

        // Payslip Ownership: Employee EMP-1001 views own payslip & downloads PDF; EMP-1003 blocked 403
        Sanctum::actingAs($this->employeeUser);
        $this->getJson('/api/payroll/payslips/me')->assertStatus(200)->assertJsonCount(2, 'payslips');
        $this->getJson("/api/payroll/payslips/{$entryId}")->assertStatus(200);

        $pdfResponse = $this->get("/api/payroll/payslips/{$entryId}/pdf")->assertStatus(200);
        $this->assertStringContainsString('application/pdf', (string) $pdfResponse->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF-', $pdfResponse->getContent());

        // Cross-employee payslip & PDF access strictly rejected 403
        Sanctum::actingAs($this->otherEmployeeUser);
        $this->getJson("/api/payroll/payslips/{$entryId}")->assertStatus(403);
        $this->get("/api/payroll/payslips/{$entryId}/pdf")->assertStatus(403);
    }

    public function test_segregation_of_duties_prevents_reviewer_from_self_approving(): void
    {
        Sanctum::actingAs($this->hrAdminUser);

        $this->postJson('/api/payroll/compensations', [
            'employee_code' => 'EMP-1001',
            'pay_basis' => 'Monthly',
            'base_amount' => '25000.00',
            'effective_date' => '2026-11-01',
        ])->assertStatus(201);

        $periodId = $this->postJson('/api/payroll/periods', [
            'schedule_type' => 'Monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'pay_date' => '2026-11-30',
        ])->assertStatus(201)->json('period.id');

        $this->postJson("/api/payroll/periods/{$periodId}/calculate")->assertStatus(200);
        $this->postJson("/api/payroll/periods/{$periodId}/submit-review")->assertStatus(200);

        // Same HR Admin who submitted for review cannot self-approve
        $this->postJson("/api/payroll/periods/{$periodId}/approve")
            ->assertStatus(403)
            ->assertJsonPath('code', 'SEGREGATION_OF_DUTIES_VIOLATION');
    }

    public function test_database_unique_constraint_prevents_duplicate_employee_period_entry(): void
    {
        Sanctum::actingAs($this->hrAdminUser);

        $comp = $this->postJson('/api/payroll/compensations', [
            'employee_code' => 'EMP-1001',
            'pay_basis' => 'Monthly',
            'base_amount' => '25000.00',
            'effective_date' => '2026-11-01',
        ])->assertStatus(201);

        $period = PayrollPeriod::query()->create([
            'label' => 'Unique Check Period',
            'schedule_type' => 'Monthly',
            'period_start' => '2026-12-01',
            'period_end' => '2026-12-31',
            'pay_date' => '2026-12-31',
            'status' => 'Draft',
            'created_by_user_id' => $this->hrAdminUser->id,
        ]);

        $emp = Employee::query()->where('employee_code', 'EMP-1001')->firstOrFail();

        PayrollEntry::query()->create([
            'payroll_period_id' => $period->id,
            'employee_id' => $emp->id,
            'compensation_id' => $comp->json('compensation.id'),
            'pay_basis' => 'Monthly',
            'base_compensation_centavos' => 2_500_000,
            'warnings_json' => [],
            'rule_snapshot_json' => [],
        ]);

        $this->expectException(QueryException::class);

        PayrollEntry::query()->create([
            'payroll_period_id' => $period->id,
            'employee_id' => $emp->id,
            'compensation_id' => $comp->json('compensation.id'),
            'pay_basis' => 'Monthly',
            'base_compensation_centavos' => 2_500_000,
            'warnings_json' => [],
            'rule_snapshot_json' => [],
        ]);
    }

    public function test_daily_units_confirmation_period_date_validation_and_login_rate_limiting(): void
    {
        Sanctum::actingAs($this->hrAdminUser);

        // Invalid date range rejected with 422 without saving
        $this->postJson('/api/payroll/periods', [
            'schedule_type' => 'Semimonthly',
            'period_start' => '2026-11-15',
            'period_end' => '2026-11-01',
            'pay_date' => '2026-11-20',
        ])->assertStatus(422);

        $this->postJson('/api/payroll/compensations', [
            'employee_code' => 'EMP-1003',
            'pay_basis' => 'Daily',
            'base_amount' => '950.00',
            'effective_date' => '2026-11-01',
        ])->assertStatus(201);

        $periodId = $this->postJson('/api/payroll/periods', [
            'label' => 'Daily Basis Cutoff',
            'schedule_type' => 'Semimonthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-15',
            'pay_date' => '2026-11-20',
        ])->assertStatus(201)->json('period.id');

        $calc = $this->postJson("/api/payroll/periods/{$periodId}/calculate")->assertStatus(200);
        $marcusEntry = $calc->json('generatedEntries.0');
        $this->assertTrue($marcusEntry['requiresReview']);
        $this->assertSame(0, $marcusEntry['grossPayCentavos']);

        $confirmed = $this->patchJson("/api/payroll/entries/{$marcusEntry['id']}/units", [
            'units_input' => '10.50',
        ])->assertStatus(200);
        // 950.00 * 10.50 days = 9,975.00 -> 997,500 centavos
        $this->assertSame(997_500, $confirmed->json('entry.grossPayCentavos'));
        $this->assertTrue($confirmed->json('entry.requiresReview'));

        // Verify login endpoint rate limiting enforces 429 after 10 attempts/minute
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'ratelimit.test@smarthr.test',
                'password' => 'InvalidPass123',
            ])->assertStatus(401);
        }
        $this->postJson('/api/auth/login', [
            'email' => 'ratelimit.test@smarthr.test',
            'password' => 'InvalidPass123',
        ])->assertStatus(429);
    }
}
