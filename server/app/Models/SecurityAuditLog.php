<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SecurityAuditLog extends Model
{
    protected $fillable = [
        'event_type',
        'actor_user_id',
        'actor_employee_code',
        'actor_role',
        'target_employee_code',
        'summary',
        'ip_address',
        'occurred_at_utc',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at_utc' => 'datetime',
        ];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}

