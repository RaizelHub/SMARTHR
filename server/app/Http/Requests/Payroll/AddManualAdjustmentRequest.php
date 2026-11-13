<?php

namespace App\Http\Requests\Payroll;

use Illuminate\Foundation\Http\FormRequest;

class AddManualAdjustmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('payroll.calculate') ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'category' => ['required', 'in:Earning,Deduction'],
            'label' => ['required', 'string', 'min:2', 'max:80'],
            'amount' => ['required', 'regex:/^\d+(?:\.\d{1,2})?$/'],
            'is_taxable' => ['nullable', 'boolean'],
        ];
    }
}
