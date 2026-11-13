<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollLineItem extends Model
{
    protected $fillable = [
        'payroll_entry_id',
        'category',
        'code',
        'label',
        'amount_centavos',
        'source',
        'is_taxable',
        'adjustment_key',
        'metadata_json',
    ];

    protected function casts(): array
    {
        return [
            'amount_centavos' => 'integer',
            'is_taxable' => 'boolean',
            'metadata_json' => 'array',
        ];
    }

    public function entry(): BelongsTo
    {
        return $this->belongsTo(PayrollEntry::class, 'payroll_entry_id');
    }
}
