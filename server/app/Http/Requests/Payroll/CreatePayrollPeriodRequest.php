<?php

namespace App\Http\Requests\Payroll;

use Illuminate\Foundation\Http\FormRequest;

class CreatePayrollPeriodRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('payroll.prepare') ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'label' => ['nullable', 'string', 'max:120'],
            'schedule_type' => ['required', 'in:Monthly,Semimonthly,Weekly'],
            'period_start' => ['required', 'date_format:Y-m-d'],
            'period_end' => ['required', 'date_format:Y-m-d', 'after_or_equal:period_start'],
            'pay_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:period_start'],
            'semimonthly_half' => ['nullable', 'integer', 'in:1,2'],
            'statutory_allocation_mode' => ['nullable', 'in:HALF_HALF,FULL_SECOND_HALF'],
        ];
    }
}
