<?php

namespace App\Policies;

use App\Models\PayrollEntry;
use App\Models\User;

class PayrollEntryPolicy
{
    public function view(User $user, PayrollEntry $entry): bool
    {
        if ($user->hasPermission('payroll.read')) {
            return true;
        }

        if (! $user->hasPermission('payroll.view_own')) {
            return false;
        }

        $actorEmp = $user->employee;

        return $actorEmp !== null && (int) $actorEmp->id === (int) $entry->employee_id;
    }

    public function downloadPdf(User $user, PayrollEntry $entry): bool
    {
        return $this->view($user, $entry);
    }
}

