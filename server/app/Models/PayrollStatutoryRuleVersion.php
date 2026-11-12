<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollStatutoryRuleVersion extends Model
{
    protected $table = 'payroll_statutory_rule_versions';

    protected $fillable = [
        'rule_key',
        'agency',
        'issuance_reference',
        'official_url',
        'effective_from',
        'effective_to',
        'is_active',
        'parameters_json',
    ];

    protected function casts(): array
    {
        return [
            'effective_from' => 'date:Y-m-d',
            'effective_to' => 'date:Y-m-d',
            'is_active' => 'boolean',
            'parameters_json' => 'array',
        ];
    }
}

