<?php

namespace App\Policies;

use App\Models\User;

class EmployeeCompensationPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('payroll.read') || $user->hasPermission('compensation.manage');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('compensation.manage');
    }
}
