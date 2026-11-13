<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeCompensation extends Model
{
    protected $table = 'employee_compensations';

    protected $fillable = [
        'employee_id',
        'pay_basis',
        'base_amount_centavos',
        'currency',
        'allowances_json',
        'statutory_eligible',
        'effective_date',
        'end_date',
        'status',
        'notes',
        'created_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'base_amount_centavos' => 'integer',
            'allowances_json' => 'array',
            'statutory_eligible' => 'boolean',
            'effective_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }
}
