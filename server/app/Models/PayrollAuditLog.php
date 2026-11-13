<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollAuditLog extends Model
{
    protected $fillable = [
        'event_type',
        'actor_user_id',
        'actor_employee_code',
        'actor_role',
        'target_employee_code',
        'payroll_period_id',
        'payroll_entry_id',
        'summary',
        'metadata_json',
        'ip_address',
        'occurred_at_utc',
    ];

    protected function casts(): array
    {
        return [
            'metadata_json' => 'array',
            'occurred_at_utc' => 'datetime',
        ];
    }
}
