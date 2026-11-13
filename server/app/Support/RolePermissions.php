<?php

namespace App\Support;

final class RolePermissions
{
    public const ROLE_EMPLOYEE = 'Employee';

    public const ROLE_MANAGER = 'Manager';

    public const ROLE_HR_COORDINATOR = 'HR Coordinator';

    public const ROLE_HR_ADMIN = 'HR Admin';

    /**
     * @var array<string, list<string>>
     */
    private const MATRIX = [
        self::ROLE_EMPLOYEE => [
            'employees.read_own',
            'attendance.record_own',
            'attendance.read_own',
            'leave.request',
            'leave.read_own',
            'reports.view_own',
            'payroll.view_own',
        ],
        self::ROLE_MANAGER => [
            'employees.read_own',
            'employees.read_team',
            'attendance.record_own',
            'attendance.read_own',
            'attendance.read_team',
            'leave.request',
            'leave.read_own',
            'leave.read_team',
            'leave.approve',
            'leave.reject',
            'reports.view_own',
            'reports.view_team',
            'reports.export',
            'payroll.view_own',
        ],
        self::ROLE_HR_COORDINATOR => [
            'employees.read_own',
            'employees.read_all',
            'employees.create',
            'employees.update',
            'attendance.record_own',
            'attendance.read_own',
            'attendance.read_all',
            'leave.request',
            'leave.read_own',
            'leave.read_all',
            'leave.approve',
            'leave.reject',
            'reports.view_own',
            'reports.view_all',
            'reports.export',
            'compensation.manage',
            'payroll.view_own',
            'payroll.view',
            'payroll.read',
            'payroll.create',
            'payroll.prepare',
            'payroll.calculate',
            'payroll.review',
            'payroll.export',
        ],
        self::ROLE_HR_ADMIN => [
            'employees.read_own',
            'employees.read_all',
            'employees.create',
            'employees.update',
            'employees.delete',
            'attendance.record_own',
            'attendance.read_own',
            'attendance.read_all',
            'leave.request',
            'leave.read_own',
            'leave.read_all',
            'leave.approve',
            'leave.reject',
            'reports.view_own',
            'reports.view_all',
            'reports.export',
            'compensation.manage',
            'payroll.view_own',
            'payroll.view',
            'payroll.read',
            'payroll.create',
            'payroll.prepare',
            'payroll.calculate',
            'payroll.review',
            'payroll.approve',
            'payroll.lock',
            'payroll.export',
            'roles.manage',
        ],
    ];

    /**
     * @return list<string>
     */
    public static function forRole(?string $role): array
    {
        if ($role === null) {
            return [];
        }

        return self::MATRIX[$role] ?? [];
    }

    public static function hasPermission(?string $role, string $permission): bool
    {
        return in_array($permission, self::forRole($role), true);
    }
}
