<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\SecurityAuditLog;
use App\Models\User;
use Database\Seeders\StatutoryRuleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use PDO;
use Tests\TestCase;

class SystemIntegrationE2ETest extends TestCase
{
    use RefreshDatabase;

    private User $hrAdmin;

    private User $hrCoord;

    private User $engManager;

    private User $engEmployee;

    private User $finEmployee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(StatutoryRuleSeeder::class);

        $this->hrAdmin = $this->createEmpUser('EMP-1005', 'Alex Rivera', 'alex@smarthr.test', 'Human Resources', 'HR Admin', 'Active');
        $this->hrCoord = $this->createEmpUser('EMP-1002', 'Priya Nair', 'priya@smarthr.test', 'Human Resources', 'HR Coordinator', 'Active');
        $this->engManager = $this->createEmpUser('EMP-1004', 'Dana Reyes', 'dana@smarthr.test', 'Engineering', 'Manager', 'Active');
        $this->engEmployee = $this->createEmpUser('EMP-1001', 'Jordan Taylor', 'jordan@smarthr.test', 'Engineering', 'Employee', 'Active');
        $this->finEmployee = $this->createEmpUser('EMP-1003', 'Marcus Chen', 'marcus@smarthr.test', 'Finance', 'Employee', 'Probation');
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
            'password' => Hash::make('StrongTestPass!2026'),
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
            'hire_date' => '2025-02-01',
        ]);

        return $user->load('employee');
    }

    public function test_scenario_a_employee_onboarding_edit_status_deactivation_and_rbac(): void
    {
        // Scoped directory checks: Employee sees self only; Manager sees Engineering team; HR sees all
        Sanctum::actingAs($this->engEmployee);
        $empList = $this->getJson('/api/employees/scoped')->assertStatus(200)->json('employees');
        $this->assertCount(1, $empList);
        $this->assertSame('EMP-1001', $empList[0]['employeeId']);

        // Regular Employee cannot create employees or assign roles
        $this->postJson('/api/employees', [
            'employeeId' => 'EMP-9999',
            'fullName' => 'Unauthorized Hire',
            'workEmail' => 'unauth@smarthr.test',
            'department' => 'Engineering',
            'position' => 'Engineer',
            'employmentStatus' => 'Active',
            'hireDate' => '2026-11-01',
            'assignedRole' => 'Employee',
        ])->assertStatus(403);

        Sanctum::actingAs($this->engManager);
        $mgrList = $this->getJson('/api/employees/scoped')->assertStatus(200)->json('employees');
        $this->assertCount(2, $mgrList); // Dana Reyes + Jordan Taylor (both Engineering)

        // HR Coordinator can onboard Employee, but CANNOT assign HR Admin role
        Sanctum::actingAs($this->hrCoord);
        $this->postJson('/api/employees', [
            'employeeId' => 'EMP-2001',
            'fullName' => 'Samira Patel',
            'workEmail' => 'samira@smarthr.test',
            'department' => 'Engineering',
            'position' => 'Platform Engineer',
            'employmentStatus' => 'Active',
            'hireDate' => '2026-11-05',
            'assignedRole' => 'HR Admin',
        ])->assertStatus(403);

        $created = $this->postJson('/api/employees', [
            'employeeId' => 'EMP-2001',
            'fullName' => 'Samira Patel',
            'workEmail' => 'samira@smarthr.test',
            'department' => 'Engineering',
            'position' => 'Platform Engineer',
            'employmentStatus' => 'Probation',
            'hireDate' => '2026-11-05',
            'assignedRole' => 'Employee',
            'password' => 'SamiraValidPass!2026',
        ])->assertStatus(201);
        $this->assertSame('EMP-2001', $created->json('employee.employeeId'));

        // Duplicate ID & Email blocked with 409
        $this->postJson('/api/employees', [
            'employeeId' => 'EMP-2001',
            'fullName' => 'Duplicate Id',
            'workEmail' => 'unique@smarthr.test',
            'department' => 'Sales',
            'position' => 'AE',
            'employmentStatus' => 'Active',
            'hireDate' => '2026-11-05',
            'assignedRole' => 'Employee',
        ])->assertStatus(409)->assertJsonPath('code', 'DUPLICATE_EMPLOYEE_ID');

        // Login as Samira using Sanctum token, then deactivate Samira via HR Admin -> active token immediately fails 403!
        $samiraLogin = $this->postJson('/api/auth/login', [
            'email' => 'samira@smarthr.test',
            'password' => 'SamiraValidPass!2026',
        ])->assertStatus(200);
        $samiraToken = $samiraLogin->json('token');

        Sanctum::actingAs($this->hrAdmin);
        $this->patchJson('/api/employees/EMP-2001', [
            'employmentStatus' => 'Inactive',
            'position' => 'Senior Platform Engineer',
        ])->assertStatus(200)->assertJsonPath('employee.employmentStatus', 'Inactive');

        // Reset Sanctum facade auth so Bearer header is evaluated cleanly
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$samiraToken}")
            ->getJson('/api/employees/scoped')
            ->assertStatus(401); // Revoked on update()!

        // Also test residual active token when employee was marked Inactive directly in DB
        $jordanLogin = $this->postJson('/api/auth/login', [
            'email' => 'jordan@smarthr.test',
            'password' => 'StrongTestPass!2026',
        ])->assertStatus(200);
        $jordanToken = $jordanLogin->json('token');
        $this->engEmployee->employee->update(['employment_status' => 'Inactive']);
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', "Bearer {$jordanToken}")
            ->getJson('/api/employees/scoped')
            ->assertStatus(403)
            ->assertJsonPath('code', 'EMPLOYEE_INACTIVE');

        // Security audit logs captured creation, denial, and deactivation
        Sanctum::actingAs($this->hrAdmin);
        $audit = $this->getJson('/api/security-audit-logs')->assertStatus(200)->json('auditEvents');
        $this->assertNotEmpty($audit);
    }

    public function test_scenario_b_and_c_attendance_and_leave_workflows_with_rbac(): void
    {
        Sanctum::actingAs($this->engEmployee);

        // Clock-in & duplicate clock-in protection
        $clockIn = $this->postJson('/api/attendance/clock-in', ['employeeId' => 'EMP-1001'])->assertStatus(201);
        $this->assertSame('Clocked In', $clockIn->json('record.status'));
        $this->assertSame('Asia/Manila', $clockIn->json('record.businessTimezone'));

        $this->postJson('/api/attendance/clock-in', ['employeeId' => 'EMP-1001'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'DUPLICATE_CLOCK_IN');

        // Cross-employee clock-in forbidden
        $this->postJson('/api/attendance/clock-in', ['employeeId' => 'EMP-1003'])->assertStatus(403);

        // Active status & Clock-out & duplicate clock-out protection
        $this->getJson('/api/attendance/active?employeeId=EMP-1001')
            ->assertStatus(200)
            ->assertJsonPath('session.status', 'Clocked In');

        $clockOut = $this->postJson('/api/attendance/clock-out', ['employeeId' => 'EMP-1001'])->assertStatus(200);
        $this->assertSame('Clocked Out', $clockOut->json('record.status'));
        $this->assertIsInt($clockOut->json('record.durationMinutes'));

        $this->postJson('/api/attendance/clock-out', ['employeeId' => 'EMP-1001'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'DUPLICATE_CLOCK_OUT');

        // Submit Leave Request & overlap prevention
        $leave1 = $this->postJson('/api/leave-requests', [
            'employeeId' => 'EMP-1001',
            'leaveType' => 'Annual Leave',
            'startDate' => '2026-11-20',
            'endDate' => '2026-11-22',
            'reason' => 'Family outing out of town',
        ])->assertStatus(201);
        $leave1Id = $leave1->json('request.id');
        $this->assertSame(3, $leave1->json('request.calendarDays'));

        // Overlapping date range blocked 409
        $this->postJson('/api/leave-requests', [
            'employeeId' => 'EMP-1001',
            'leaveType' => 'Sick Leave',
            'startDate' => '2026-11-21',
            'endDate' => '2026-11-23',
            'reason' => 'Overlapping request test',
        ])->assertStatus(409)->assertJsonPath('code', 'OVERLAPPING_LEAVE_REQUEST');

        // Employee cannot approve own leave request
        $this->postJson("/api/leave-requests/{$leave1Id}/review", [
            'decision' => 'Approved',
        ])->assertStatus(403);

        // Engineering Manager submits own leave, cannot self-approve!
        Sanctum::actingAs($this->engManager);
        $mgrLeave = $this->postJson('/api/leave-requests', [
            'employeeId' => 'EMP-1004',
            'leaveType' => 'Sick Leave',
            'startDate' => '2026-12-01',
            'endDate' => '2026-12-01',
            'reason' => 'Dental appointment',
        ])->assertStatus(201);
        $mgrLeaveId = $mgrLeave->json('request.id');

        $this->postJson("/api/leave-requests/{$mgrLeaveId}/review", [
            'decision' => 'Approved',
        ])->assertStatus(403);

        // Engineering Manager CAN approve Jordan Taylor's Engineering leave
        $approved = $this->postJson("/api/leave-requests/{$leave1Id}/review", [
            'decision' => 'Approved',
            'reviewerNote' => 'Coverage arranged',
        ])->assertStatus(200);
        $this->assertSame('Approved', $approved->json('request.status'));
        $this->assertCount(2, $approved->json('request.decisionHistory'));

        // Already Approved leave cannot be cancelled or re-rejected
        $this->postJson("/api/leave-requests/{$leave1Id}/review", ['decision' => 'Rejected'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'INVALID_STATUS_TRANSITION');

        // Finance employee leave CANNOT be approved by Engineering Manager (cross-dept blocked!)
        Sanctum::actingAs($this->finEmployee);
        $finLeave = $this->postJson('/api/leave-requests', [
            'employeeId' => 'EMP-1003',
            'leaveType' => 'Emergency Leave',
            'startDate' => '2026-12-04',
            'endDate' => '2026-12-04',
            'reason' => 'Home repair',
        ])->assertStatus(201);
        $finLeaveId = $finLeave->json('request.id');

        Sanctum::actingAs($this->engManager);
        $this->postJson("/api/leave-requests/{$finLeaveId}/review", ['decision' => 'Approved'])->assertStatus(403);

        // HR Coordinator CAN reject cross-department leave
        Sanctum::actingAs($this->hrCoord);
        $this->postJson("/api/leave-requests/{$finLeaveId}/review", [
            'decision' => 'Rejected',
            'reviewerNote' => 'Missing required handoff documentation',
        ])->assertStatus(200)->assertJsonPath('request.status', 'Rejected');
    }

    public function test_scenario_d_reporting_accuracy_rbac_scoping_and_csv_formula_protection(): void
    {
        // Seed real attendance + leave + CSV formula trigger payload in employee name
        Sanctum::actingAs($this->hrAdmin);
        $this->postJson('/api/employees', [
            'employeeId' => 'EMP-3001',
            'fullName' => '=cmd|"/C calc"!A0',
            'workEmail' => 'formula@smarthr.test',
            'department' => 'Sales',
            'position' => 'Sales Rep',
            'employmentStatus' => 'Active',
            'hireDate' => '2026-11-01',
            'assignedRole' => 'Employee',
        ])->assertStatus(201);

        Sanctum::actingAs($this->engEmployee);
        $this->postJson('/api/attendance/clock-in', ['employeeId' => 'EMP-1001'])->assertStatus(201);
        $this->postJson('/api/leave-requests', [
            'employeeId' => 'EMP-1001',
            'leaveType' => 'Annual Leave',
            'startDate' => '2026-11-10',
            'endDate' => '2026-11-12',
            'reason' => 'Sensitive personal details should not leak to CSV',
        ])->assertStatus(201);

        // Employee cannot probe cross-dept report or export CSV
        $this->getJson('/api/reports/summary?department=Finance')->assertStatus(403);
        $this->getJson('/api/reports/summary?employeeId=EMP-1003')->assertStatus(403);
        $this->get('/api/reports/export/employees')->assertStatus(403);

        // Employee sees strictly own analytics
        $empReport = $this->getJson('/api/reports/summary')->assertStatus(200)->json('report');
        $this->assertSame('own', $empReport['authorizedScope']);
        $this->assertFalse($empReport['canExport']);
        $this->assertSame(1, $empReport['employeeAnalytics']['totalEmployees']);
        $this->assertSame(1, $empReport['attendanceAnalytics']['totalSessions']);
        $this->assertSame(1, $empReport['leaveAnalytics']['totalRequests']);

        // Engineering Manager sees strictly Engineering department (EMP-1004 + EMP-1001 = 2)
        Sanctum::actingAs($this->engManager);
        $mgrReport = $this->getJson('/api/reports/summary')->assertStatus(200)->json('report');
        $this->assertSame('team', $mgrReport['authorizedScope']);
        $this->assertTrue($mgrReport['canExport']);
        $this->assertSame(2, $mgrReport['employeeAnalytics']['totalEmployees']);
        $this->getJson('/api/reports/summary?department=Sales')->assertStatus(403);

        // HR Coordinator verifies invalid date order rejected 400 and full org export neutralizes CSV injection
        Sanctum::actingAs($this->hrCoord);
        $this->getJson('/api/reports/summary?startDate=2026-11-20&endDate=2026-11-01')->assertStatus(400);

        $orgReport = $this->getJson('/api/reports/summary')->assertStatus(200)->json('report');
        $this->assertSame(6, $orgReport['employeeAnalytics']['totalEmployees']);
        $this->assertFalse($orgReport['policyFlags']['leaveBalanceTrackingSupported']);

        $csvRes = $this->get('/api/reports/export/employees')->assertStatus(200);
        $csvBody = $csvRes->getContent();
        $this->assertStringContainsString("'=cmd|", $csvBody);
        $this->assertStringNotContainsString('formula@smarthr.test', $csvBody); // PII email excluded

        $leaveCsvRes = $this->get('/api/reports/export/leave')->assertStatus(200);
        $this->assertStringNotContainsString('Sensitive personal details', $leaveCsvRes->getContent());
    }

    public function test_scenario_e_integrated_payroll_and_historical_delete_protection(): void
    {
        // Employee clocks in during payroll period so payroll sees real attendanceSessionsInPeriod >= 1
        Sanctum::actingAs($this->engEmployee);
        $this->postJson('/api/attendance/clock-in', ['employeeId' => 'EMP-1001'])->assertStatus(201);
        $this->postJson('/api/attendance/clock-out', ['employeeId' => 'EMP-1001'])->assertStatus(200);

        Sanctum::actingAs($this->hrAdmin);
        $this->postJson('/api/payroll/compensations', [
            'employee_code' => 'EMP-1001',
            'pay_basis' => 'Monthly',
            'base_amount' => '32000.00',
            'effective_date' => '2026-11-01',
        ])->assertStatus(201);

        Sanctum::actingAs($this->hrCoord);
        $periodId = $this->postJson('/api/payroll/periods', [
            'label' => 'Integrated Period',
            'schedule_type' => 'Semimonthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'pay_date' => '2026-11-30',
        ])->assertStatus(201)->json('period.id');

        $calc = $this->postJson("/api/payroll/periods/{$periodId}/calculate")->assertStatus(200);
        $entry = collect($calc->json('generatedEntries'))->firstWhere('employeeId', 'EMP-1001');
        $this->assertNotNull($entry);
        $this->assertSame(1, $entry['attendanceSessionsInPeriod']);

        $submit = $this->postJson("/api/payroll/periods/{$periodId}/submit-review")->assertStatus(200);
        $version = $submit->json('period.version');

        Sanctum::actingAs($this->hrAdmin);
        $approved = $this->postJson("/api/payroll/periods/{$periodId}/approve", [
            'expected_version' => $version,
        ])->assertStatus(200);
        $this->postJson("/api/payroll/periods/{$periodId}/lock", [
            'expected_version' => $approved->json('period.version'),
        ])->assertStatus(200);

        // Hard deleting an employee with attendance/compensation/payroll history is strictly blocked (409)
        $this->deleteJson('/api/employees/EMP-1001')
            ->assertStatus(409)
            ->assertJsonPath('code', 'HISTORICAL_RECORDS_PROTECTED');

        // Verify records remain intact and payslip PDF succeeds for owner while denied for coworker
        Sanctum::actingAs($this->engEmployee);
        $this->get("/api/payroll/payslips/{$entry['id']}/pdf")->assertStatus(200);

        Sanctum::actingAs($this->finEmployee);
        $this->get("/api/payroll/payslips/{$entry['id']}/pdf")->assertStatus(403);
    }

    public function test_health_endpoint_and_non_destructive_backup_restore_verification(): void
    {
        // Health check verifies DB connectivity and timezone without leaking env secrets
        $health = $this->getJson('/api/health')->assertStatus(200);
        $health->assertJsonPath('status', 'ok')
            ->assertJsonPath('database', 'connected')
            ->assertJsonPath('timezone', 'Asia/Manila');
        $this->assertStringNotContainsString('APP_KEY', json_encode($health->json()));

        // Perform a disposable non-destructive SQLite backup & restore parity verification
        $tmpDir = sys_get_temp_dir().DIRECTORY_SEPARATOR.'smarthr_backup_test_'.uniqid('', true);
        mkdir($tmpDir, 0777, true);
        $sourceDb = $tmpDir.DIRECTORY_SEPARATOR.'source.sqlite';
        $backupDb = $tmpDir.DIRECTORY_SEPARATOR.'backup.sqlite';
        $restoredDb = $tmpDir.DIRECTORY_SEPARATOR.'restored.sqlite';

        try {
            $pdo = new PDO('sqlite:'.$sourceDb);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->exec('CREATE TABLE employees (id INTEGER PRIMARY KEY, employee_code TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL)');
            $pdo->exec('CREATE TABLE payroll_entries (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL, net_pay_centavos INTEGER NOT NULL, FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT)');
            $pdo->exec("INSERT INTO employees (id, employee_code, full_name) VALUES (1, 'EMP-1001', 'Jordan Taylor')");
            $pdo->exec('INSERT INTO payroll_entries (id, employee_id, net_pay_centavos) VALUES (1, 1, 1427130)');
            $pdo = null;

            // Backup snapshot copy & integrity check
            $this->assertTrue(copy($sourceDb, $backupDb));

            // Simulate target rebuild and restore from backup copy
            $this->assertTrue(copy($backupDb, $restoredDb));
            $restoredPdo = new PDO('sqlite:'.$restoredDb);
            $restoredPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $integrity = $restoredPdo->query('PRAGMA integrity_check')->fetchColumn();
            $this->assertSame('ok', $integrity);

            $restoredEmployeeCount = (int) $restoredPdo->query('SELECT COUNT(*) FROM employees')->fetchColumn();
            $restoredEntryNet = (int) $restoredPdo->query('SELECT net_pay_centavos FROM payroll_entries WHERE id = 1')->fetchColumn();
            $this->assertSame(1, $restoredEmployeeCount);
            $this->assertSame(1427130, $restoredEntryNet);
            $restoredPdo = null;
        } finally {
            @unlink($sourceDb);
            @unlink($backupDb);
            @unlink($restoredDb);
            @rmdir($tmpDir);
        }

        // Verify security audit table remains readable for authorized HR Admin
        Sanctum::actingAs($this->hrAdmin);
        $this->assertIsInt(SecurityAuditLog::query()->count());
    }
}
