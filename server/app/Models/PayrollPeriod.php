<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayrollPeriod extends Model
{
    public const STATUS_DRAFT = 'Draft';

    public const STATUS_CALCULATED = 'Calculated';

    public const STATUS_UNDER_REVIEW = 'Under Review';

    public const STATUS_APPROVED = 'Approved';

    public const STATUS_LOCKED = 'Locked';

    protected $fillable = [
        'label',
        'schedule_type',
        'period_start',
        'period_end',
        'pay_date',
        'semimonthly_half',
        'statutory_allocation_mode',
        'status',
        'business_timezone',
        'created_by_user_id',
        'reviewed_by_user_id',
        'reviewed_at',
        'review_notes',
        'approved_by_user_id',
        'approved_at',
        'approval_notes',
        'locked_by_user_id',
        'locked_at',
        'returned_reason',
        'version',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date:Y-m-d',
            'period_end' => 'date:Y-m-d',
            'pay_date' => 'date:Y-m-d',
            'semimonthly_half' => 'integer',
            'reviewed_at' => 'datetime',
            'approved_at' => 'datetime',
            'locked_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function lockedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'locked_by_user_id');
    }

    public function entries(): HasMany
    {
        return $this->hasMany(PayrollEntry::class, 'payroll_period_id');
    }

    public function isMutable(): bool
    {
        return in_array($this->status, [self::STATUS_DRAFT, self::STATUS_CALCULATED], true);
    }

    public function isFinalized(): bool
    {
        return in_array($this->status, [self::STATUS_APPROVED, self::STATUS_LOCKED], true);
    }
}
