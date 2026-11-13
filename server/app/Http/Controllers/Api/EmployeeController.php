<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Transformers\PayrollPresenter;
use App\Models\Employee;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\SecurityAuditRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class EmployeeController extends Controller
{
    private const DEPARTMENTS = [
        'Engineering',
        'Human Resources',
        'Finance',
        'Operations',
        'Product',
        'Sales',
        'Customer Support',
    ];

    private const STATUSES = [
        'Active',
        'Probation',
        'On Leave',
        'Inactive',
    ];

    private const ROLES = [
        'Employee',
        'Manager',
        'HR Coordinator',
        'HR Admin',
    ];

    public function scopedIndex(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load('employee');
        $actorEmp = $user->employee;

        if (! $actorEmp) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Employee profile is required.',
            ], 403);
        }

        if ($user->hasPermission('employees.read_all')) {
            $employees = Employee::query()->orderByDesc('id')->get();
        } elseif ($user->hasPermission('employees.read_team')) {
            $employees = Employee::query()
                ->where('department', $actorEmp->department)
                ->orderByDesc('id')
                ->get();
        } elseif ($user->hasPermission('employees.read_own')) {
            $employees = Employee::query()->whereKey($actorEmp->id)->get();
        } else {
            SecurityAuditRecorder::record(
                'EMPLOYEE_ACCESS_DENIED',
                $user,
                null,
                'Denied attempt to read employee records without authorization',
                $request->ip(),
            );

            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You are not authorized to view employee records.',
            ], 403);
        }

        return response()->json([
            'employees' => $employees->map(fn (Employee $emp): array => PayrollPresenter::employeeReference($emp))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user()->load('employee');

        if (! $actor->hasPermission('employees.create')) {
            SecurityAuditRecorder::record(
                'EMPLOYEE_CREATE_DENIED',
                $actor,
                $request->input('employeeId'),
                'Denied unauthorized employee registration attempt',
                $request->ip(),
            );

            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You do not have permission to register new employees.',
            ], 403);
        }

        $validated = $request->validate([
            'employeeId' => ['required', 'string', 'min:3', 'max:32', 'regex:/^[A-Za-z0-9-]+$/'],
            'fullName' => ['required', 'string', 'min:2', 'max:120'],
            'workEmail' => ['required', 'email', 'max:160'],
            'department' => ['required', Rule::in(self::DEPARTMENTS)],
            'position' => ['required', 'string', 'min:2', 'max:120'],
            'employmentStatus' => ['required', Rule::in(self::STATUSES)],
            'hireDate' => ['required', 'date_format:Y-m-d'],
            'assignedRole' => ['required', Rule::in(self::ROLES)],
            'isMinimumWageEarner' => ['sometimes', 'boolean'],
            'password' => ['sometimes', 'nullable', 'string', 'min:12', 'max:128'],
        ]);

        if ($validated['assignedRole'] === 'HR Admin' && ! $actor->hasPermission('roles.manage')) {
            SecurityAuditRecorder::record(
                'ROLE_CHANGE_DENIED',
                $actor,
                strtoupper(trim($validated['employeeId'])),
                'Non-HR-Admin attempted to assign HR Admin role during employee onboarding',
                $request->ip(),
            );

            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Only an HR Admin can assign the HR Admin role during registration.',
                'errors' => [
                    'assignedRole' => ['Only an HR Admin can assign the HR Admin role during registration.'],
                ],
            ], 403);
        }

        $code = strtoupper(trim($validated['employeeId']));
        $email = strtolower(trim($validated['workEmail']));

        if (Employee::query()->whereRaw('UPPER(employee_code) = ?', [$code])->exists()) {
            return response()->json([
                'code' => 'DUPLICATE_EMPLOYEE_ID',
                'message' => "Employee ID \"{$code}\" is already registered",
                'errors' => [
                    'employeeId' => ["Employee ID \"{$code}\" is already registered"],
                ],
            ], 409);
        }

        if (Employee::query()->whereRaw('LOWER(work_email) = ?', [$email])->exists()
            || User::query()->whereRaw('LOWER(email) = ?', [$email])->exists()) {
            return response()->json([
                'code' => 'DUPLICATE_WORK_EMAIL',
                'message' => "Work email \"{$email}\" is already assigned to another employee",
                'errors' => [
                    'workEmail' => ["Work email \"{$email}\" is already assigned to another employee"],
                ],
            ], 409);
        }

        $employee = DB::transaction(function () use ($validated, $code, $email): Employee {
            $rawPassword = $validated['password'] ?? Str::random(32);

            $user = User::query()->create([
                'name' => trim($validated['fullName']),
                'email' => $email,
                'password' => Hash::make($rawPassword),
            ]);

            return Employee::query()->create([
                'user_id' => $user->id,
                'employee_code' => $code,
                'full_name' => trim($validated['fullName']),
                'work_email' => $email,
                'department' => $validated['department'],
                'position' => trim($validated['position']),
                'employment_status' => $validated['employmentStatus'],
                'assigned_role' => $validated['assignedRole'],
                'is_minimum_wage_earner' => (bool) ($validated['isMinimumWageEarner'] ?? false),
                'hire_date' => $validated['hireDate'],
            ]);
        });

        SecurityAuditRecorder::record(
            'EMPLOYEE_CREATED',
            $actor,
            $employee->employee_code,
            "Registered employee {$employee->full_name} ({$employee->department}, {$employee->assigned_role})",
            $request->ip(),
        );

        return response()->json([
            'employee' => PayrollPresenter::employeeReference($employee),
        ], 201);
    }

    public function update(Request $request, string $identifier): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user()->load('employee');

        if (! $actor->hasPermission('employees.update')) {
            SecurityAuditRecorder::record(
                'EMPLOYEE_UPDATE_DENIED',
                $actor,
                $identifier,
                'Denied unauthorized employee record update attempt',
                $request->ip(),
            );

            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You do not have permission to update employee records.',
            ], 403);
        }

        $target = $this->resolveEmployee($identifier);
        if (! $target) {
            return response()->json([
                'code' => 'EMPLOYEE_NOT_FOUND',
                'message' => "Employee \"{$identifier}\" was not found.",
            ], 404);
        }

        $validated = $request->validate([
            'fullName' => ['sometimes', 'required', 'string', 'min:2', 'max:120'],
            'workEmail' => ['sometimes', 'required', 'email', 'max:160'],
            'department' => ['sometimes', 'required', Rule::in(self::DEPARTMENTS)],
            'position' => ['sometimes', 'required', 'string', 'min:2', 'max:120'],
            'employmentStatus' => ['sometimes', 'required', Rule::in(self::STATUSES)],
            'hireDate' => ['sometimes', 'required', 'date_format:Y-m-d'],
            'isMinimumWageEarner' => ['sometimes', 'boolean'],
        ]);

        if (isset($validated['workEmail'])) {
            $email = strtolower(trim($validated['workEmail']));
            $duplicateEmail = Employee::query()
                ->whereRaw('LOWER(work_email) = ?', [$email])
                ->where('id', '!=', $target->id)
                ->exists();

            if ($duplicateEmail) {
                return response()->json([
                    'code' => 'DUPLICATE_WORK_EMAIL',
                    'message' => "Work email \"{$email}\" is already assigned to another employee",
                    'errors' => [
                        'workEmail' => ["Work email \"{$email}\" is already assigned to another employee"],
                    ],
                ], 409);
            }
        }

        if (isset($validated['employmentStatus'])
            && $validated['employmentStatus'] === 'Inactive'
            && $target->assigned_role === 'HR Admin') {
            $otherActiveAdmins = Employee::query()
                ->where('assigned_role', 'HR Admin')
                ->where('employment_status', '!=', 'Inactive')
                ->where('id', '!=', $target->id)
                ->count();

            if ($otherActiveAdmins === 0) {
                return response()->json([
                    'code' => 'VALIDATION_ERROR',
                    'message' => 'Cannot deactivate the last active HR Admin account.',
                ], 400);
            }
        }

        $previousStatus = $target->employment_status;

        $updated = DB::transaction(function () use ($target, $validated): Employee {
            $payload = [];
            if (isset($validated['fullName'])) {
                $payload['full_name'] = trim($validated['fullName']);
            }
            if (isset($validated['workEmail'])) {
                $payload['work_email'] = strtolower(trim($validated['workEmail']));
            }
            if (isset($validated['department'])) {
                $payload['department'] = $validated['department'];
            }
            if (isset($validated['position'])) {
                $payload['position'] = trim($validated['position']);
            }
            if (isset($validated['employmentStatus'])) {
                $payload['employment_status'] = $validated['employmentStatus'];
            }
            if (isset($validated['hireDate'])) {
                $payload['hire_date'] = $validated['hireDate'];
            }
            if (array_key_exists('isMinimumWageEarner', $validated)) {
                $payload['is_minimum_wage_earner'] = (bool) $validated['isMinimumWageEarner'];
            }

            if ($payload !== []) {
                $target->update($payload);
            }

            if ($target->user) {
                $userUpdates = [];
                if (isset($payload['full_name'])) {
                    $userUpdates['name'] = $payload['full_name'];
                }
                if (isset($payload['work_email'])) {
                    $userUpdates['email'] = $payload['work_email'];
                }
                if ($userUpdates !== []) {
                    $target->user->update($userUpdates);
                }

                if ($target->employment_status === 'Inactive') {
                    // Immediately invalidate all Sanctum API sessions upon employee deactivation
                    $target->user->tokens()->delete();
                }
            }

            return $target->fresh();
        });

        $eventType = ($previousStatus !== 'Inactive' && $updated->employment_status === 'Inactive')
            ? 'EMPLOYEE_DEACTIVATED'
            : 'EMPLOYEE_UPDATED';

        SecurityAuditRecorder::record(
            $eventType,
            $actor,
            $updated->employee_code,
            "Updated employee {$updated->full_name} (status: {$updated->employment_status})",
            $request->ip(),
        );

        return response()->json([
            'employee' => PayrollPresenter::employeeReference($updated),
        ]);
    }

    public function updateRole(Request $request, string $identifier): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user()->load('employee');

        if (! $actor->hasPermission('roles.manage')) {
            SecurityAuditRecorder::record(
                'ROLE_CHANGE_DENIED',
                $actor,
                $identifier,
                'Denied unauthorized attempt to change employee role',
                $request->ip(),
            );

            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Only an HR Admin can change employee roles.',
            ], 403);
        }

        $target = $this->resolveEmployee($identifier);
        if (! $target) {
            return response()->json([
                'code' => 'EMPLOYEE_NOT_FOUND',
                'message' => "Employee \"{$identifier}\" was not found.",
            ], 404);
        }

        $validated = $request->validate([
            'newRole' => ['required', Rule::in(self::ROLES)],
        ]);

        $newRole = $validated['newRole'];

        if ($target->assigned_role === 'HR Admin' && $newRole !== 'HR Admin') {
            $remainingAdmins = Employee::query()
                ->where('assigned_role', 'HR Admin')
                ->where('employment_status', '!=', 'Inactive')
                ->where('id', '!=', $target->id)
                ->count();

            if ($remainingAdmins === 0) {
                return response()->json([
                    'code' => 'VALIDATION_ERROR',
                    'message' => 'Cannot remove HR Admin privileges from the last active administrator.',
                ], 400);
            }
        }

        $previousRole = $target->assigned_role;
        $target->update(['assigned_role' => $newRole]);

        SecurityAuditRecorder::record(
            'ROLE_CHANGED',
            $actor,
            $target->employee_code,
            "Updated role from {$previousRole} to {$newRole}",
            $request->ip(),
        );

        return response()->json([
            'employee' => PayrollPresenter::employeeReference($target->fresh()),
        ]);
    }

    public function destroy(Request $request, string $identifier): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user()->load('employee');

        if (! $actor->hasPermission('employees.delete')) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Only an HR Admin can manage employee deletion requests.',
            ], 403);
        }

        $target = $this->resolveEmployee($identifier);
        if (! $target) {
            return response()->json([
                'code' => 'EMPLOYEE_NOT_FOUND',
                'message' => "Employee \"{$identifier}\" was not found.",
            ], 404);
        }

        // Preserve audit, payroll, compensation, attendance, and leave history unconditionally.
        $hasHistory = $target->payrollEntries()->exists()
            || $target->compensations()->exists()
            || $target->attendances()->exists()
            || $target->leaveRequests()->exists();

        if ($hasHistory) {
            SecurityAuditRecorder::record(
                'EMPLOYEE_DELETE_BLOCKED',
                $actor,
                $target->employee_code,
                'Blocked hard delete of employee with historical HR/payroll records; soft deactivation required',
                $request->ip(),
            );

            return response()->json([
                'code' => 'HISTORICAL_RECORDS_PROTECTED',
                'message' => "Cannot delete {$target->full_name} ({$target->employee_code}) because historical attendance, leave, compensation, or payroll records exist. Change Employment Status to Inactive instead.",
            ], 409);
        }

        return response()->json([
            'code' => 'SOFT_DEACTIVATE_REQUIRED',
            'message' => 'Smart HR preserves all employee records for audit compliance. Change Employment Status to Inactive instead of hard deleting.',
        ], 409);
    }

    public function securityAuditLogs(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user()->load('employee');

        if (! $actor->hasPermission('roles.manage')) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Only an HR Admin can inspect the security audit log.',
            ], 403);
        }

        $logs = SecurityAuditLog::query()
            ->orderByDesc('occurred_at_utc')
            ->orderByDesc('id')
            ->limit(200)
            ->get()
            ->map(fn (SecurityAuditLog $log): array => PayrollPresenter::securityAudit($log))
            ->values();

        return response()->json(['auditEvents' => $logs]);
    }

    private function resolveEmployee(string $identifier): ?Employee
    {
        $trimmed = trim($identifier);
        if ($trimmed === '') {
            return null;
        }

        if (ctype_digit($trimmed)) {
            $byId = Employee::query()->find((int) $trimmed);
            if ($byId) {
                return $byId;
            }
        }

        return Employee::query()
            ->whereRaw('UPPER(employee_code) = ?', [strtoupper($trimmed)])
            ->first();
    }
}
