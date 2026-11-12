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
            'payroll.view_own',
        ],
        self::ROLE_MANAGER => [
            'employees.read_own',
            'payroll.view_own',
        ],
        self::ROLE_HR_COORDINATOR => [
            'employees.read_own',
            'employees.read_all',
            'compensation.manage',
            'payroll.view_own',
            'payroll.read',
            'payroll.prepare',
            'payroll.calculate',
            'payroll.review',
            'payroll.export',
        ],
        self::ROLE_HR_ADMIN => [
            'employees.read_own',
            'employees.read_all',
            'compensation.manage',
            'payroll.view_own',
            'payroll.read',
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

