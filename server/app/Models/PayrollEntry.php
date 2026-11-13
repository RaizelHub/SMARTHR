<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayrollEntry extends Model
{
    protected $fillable = [
        'payroll_period_id',
        'employee_id',
        'compensation_id',
        'pay_basis',
        'base_compensation_centavos',
        'currency',
        'confirmed_payable_units_hundredths',
        'taxable_compensation_centavos',
        'gross_pay_centavos',
        'total_statutory_employee_centavos',
        'total_other_deductions_centavos',
        'total_deductions_centavos',
        'total_employer_cost_centavos',
        'net_pay_centavos',
        'status',
        'requires_review',
        'has_negative_net_pay',
        'warnings_json',
        'rule_snapshot_json',
    ];

    protected function casts(): array
    {
        return [
            'base_compensation_centavos' => 'integer',
            'confirmed_payable_units_hundredths' => 'integer',
            'taxable_compensation_centavos' => 'integer',
            'gross_pay_centavos' => 'integer',
            'total_statutory_employee_centavos' => 'integer',
            'total_other_deductions_centavos' => 'integer',
            'total_deductions_centavos' => 'integer',
            'total_employer_cost_centavos' => 'integer',
            'net_pay_centavos' => 'integer',
            'requires_review' => 'boolean',
            'has_negative_net_pay' => 'boolean',
            'warnings_json' => 'array',
            'rule_snapshot_json' => 'array',
        ];
    }

    public function payrollPeriod(): BelongsTo
    {
        return $this->belongsTo(PayrollPeriod::class, 'payroll_period_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }

    public function compensation(): BelongsTo
    {
        return $this->belongsTo(EmployeeCompensation::class, 'compensation_id');
    }

    public function lineItems(): HasMany
    {
        return $this->hasMany(PayrollLineItem::class, 'payroll_entry_id');
    }
}
