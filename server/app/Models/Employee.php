<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Employee extends Model
{
    protected $fillable = [
        'user_id',
        'employee_code',
        'full_name',
        'work_email',
        'department',
        'position',
        'employment_status',
        'assigned_role',
        'is_minimum_wage_earner',
        'hire_date',
    ];

    protected function casts(): array
    {
        return [
            'is_minimum_wage_earner' => 'boolean',
            'hire_date' => 'date:Y-m-d',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function compensations(): HasMany
    {
        return $this->hasMany(EmployeeCompensation::class, 'employee_id');
    }

    public function payrollEntries(): HasMany
    {
        return $this->hasMany(PayrollEntry::class, 'employee_id');
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class, 'employee_id');
    }

    public function leaveRequests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class, 'employee_id');
    }
}
