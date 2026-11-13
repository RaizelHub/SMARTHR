<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    protected $fillable = [
        'employee_id',
        'attendance_date',
        'clock_in_at_utc',
        'clock_out_at_utc',
        'duration_minutes',
        'status',
        'business_timezone',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'attendance_date' => 'date:Y-m-d',
            'clock_in_at_utc' => 'datetime',
            'clock_out_at_utc' => 'datetime',
            'duration_minutes' => 'integer',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }
}
