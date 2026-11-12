<?php

namespace App\Policies;

use App\Models\PayrollPeriod;
use App\Models\User;

class PayrollPeriodPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('payroll.read');
    }

    public function create(User $user): bool
    {
        return $user->hasPermission('payroll.prepare');
    }

    public function calculate(User $user, PayrollPeriod $period): bool
    {
        return $user->hasPermission('payroll.calculate');
    }

    public function review(User $user, PayrollPeriod $period): bool
    {
        return $user->hasPermission('payroll.review');
    }

    public function approve(User $user, PayrollPeriod $period): bool
    {
        return $user->hasPermission('payroll.approve');
    }

    public function lock(User $user, PayrollPeriod $period): bool
    {
        return $user->hasPermission('payroll.lock');
    }
}

