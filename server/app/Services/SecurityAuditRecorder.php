<?php

namespace App\Services;

use App\Models\SecurityAuditLog;
use App\Models\User;

final class SecurityAuditRecorder
{
    public static function record(
        string $eventType,
        ?User $actor,
        ?string $targetEmployeeCode,
        string $summary,
        ?string $ipAddress = null,
    ): void {
        $actorEmp = $actor?->employee;

        SecurityAuditLog::query()->create([
            'event_type' => $eventType,
            'actor_user_id' => $actor?->id,
            'actor_employee_code' => $actorEmp?->employee_code ?? ($actor ? 'USER-'.$actor->id : 'Anonymous'),
            'actor_role' => $actorEmp?->assigned_role ?? 'Unauthenticated',
            'target_employee_code' => $targetEmployeeCode,
            'summary' => substr($summary, 0, 500),
            'ip_address' => $ipAddress,
            'occurred_at_utc' => now('UTC'),
        ]);
    }
}
