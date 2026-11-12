<?php

namespace App\Http\Requests\Payroll;

use Illuminate\Foundation\Http\FormRequest;

class CreateCompensationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('compensation.manage') ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'employee_code' => ['required', 'string', 'max:32'],
            'pay_basis' => ['required', 'in:Monthly,Daily,Hourly'],
            'base_amount' => ['required', 'regex:/^\d+(?:\.\d{1,2})?$/'],
            'allowances' => ['nullable', 'array', 'max:20'],
            'allowances.*.label' => ['required', 'string', 'min:1', 'max:80'],
            'allowances.*.amount' => ['required', 'regex:/^\d+(?:\.\d{1,2})?$/'],
            'allowances.*.taxable' => ['nullable', 'boolean'],
            'statutory_eligible' => ['nullable', 'boolean'],
            'effective_date' => ['required', 'date_format:Y-m-d'],
            'end_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:effective_date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}

