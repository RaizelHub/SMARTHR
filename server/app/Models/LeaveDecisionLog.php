<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveDecisionLog extends Model
{
    protected $fillable = [
        'leave_request_id',
        'action',
        'actor_user_id',
        'actor_employee_code',
        'actor_name',
        'actor_role',
        'note',
        'occurred_at_utc',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at_utc' => 'datetime',
        ];
    }

    public function leaveRequest(): BelongsTo
    {
        return $this->belongsTo(LeaveRequest::class, 'leave_request_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}

