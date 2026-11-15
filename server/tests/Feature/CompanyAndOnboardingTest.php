<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Database\Seeders\StatutoryRuleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CompanyAndOnboardingTest extends TestCase
{
    use RefreshDatabase;

    private User $adminUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(StatutoryRuleSeeder::class);

        $user = User::query()->create([
            'name' => 'Maria Santos',
            'email' => 'admin@company.ph',
            'password' => Hash::make('StrongPassword!2026'),
        ]);

        Employee::query()->create([
            'user_id' => $user->id,
            'employee_code' => 'EMP-0001',
            'full_name' => 'Maria Santos',
            'work_email' => 'admin@company.ph',
            'department' => 'Human Resources',
            'position' => 'HR Director',
            'employment_status' => 'Active',
            'assigned_role' => 'HR Admin',
            'is_minimum_wage_earner' => false,
            'hire_date' => '2026-01-01',
        ]);

        $this->adminUser = $user->load('employee');
    }

    public function test_company_endpoint_requires_authentication(): void
    {
        $this->getJson('/api/company')->assertStatus(401);
    }

    public function test_company_endpoint_returns_organization_and_license_metadata_for_authenticated_employee(): void
    {
        Sanctum::actingAs($this->adminUser);

        $response = $this->getJson('/api/company')->assertStatus(200);

        $response->assertJsonStructure([
            'company' => [
                'name',
                'tradeName',
                'tin',
                'sssEmployerNumber',
                'philhealthEmployerNumber',
                'pagibigEmployerNumber',
                'address',
                'businessTimezone',
            ],
            'license' => [
                'status',
                'plan',
                'customerId',
                'maxEmployees',
                'activeEmployees',
                'expiresAt',
                'gracePeriodDays',
            ],
        ]);

        $this->assertSame('Asia/Manila', $response->json('company.businessTimezone'));
        $this->assertSame(1, $response->json('license.activeEmployees'));
    }

    public function test_verify_onboarding_artisan_command_passes(): void
    {
        $this->artisan('smarthr:verify-onboarding')
            ->expectsOutputToContain('All pre-flight onboarding checks PASSED')
            ->assertExitCode(0);
    }
}
