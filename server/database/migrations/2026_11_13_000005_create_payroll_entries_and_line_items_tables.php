<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('payroll_period_id')->constrained('payroll_periods')->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->foreignId('compensation_id')->constrained('employee_compensations')->restrictOnDelete();
            $table->string('pay_basis', 16);
            $table->bigInteger('base_compensation_centavos');
            $table->string('currency', 3)->default('PHP');
            $table->bigInteger('confirmed_payable_units_hundredths')->nullable();
            $table->bigInteger('taxable_compensation_centavos')->default(0);
            $table->bigInteger('gross_pay_centavos')->default(0);
            $table->bigInteger('total_statutory_employee_centavos')->default(0);
            $table->bigInteger('total_other_deductions_centavos')->default(0);
            $table->bigInteger('total_deductions_centavos')->default(0);
            $table->bigInteger('total_employer_cost_centavos')->default(0);
            $table->bigInteger('net_pay_centavos')->default(0);
            $table->string('status', 24)->default('Draft');
            $table->boolean('requires_review')->default(false);
            $table->boolean('has_negative_net_pay')->default(false);
            $table->json('warnings_json');
            $table->json('rule_snapshot_json');
            $table->timestamps();

            // Prevents duplicate entries for the same employee in the same payroll period
            $table->unique(['payroll_period_id', 'employee_id'], 'pay_entry_period_emp_uq');
            $table->index(['employee_id', 'status']);
        });

        Schema::create('payroll_line_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('payroll_entry_id')->constrained('payroll_entries')->cascadeOnDelete();
            $table->string('category', 24); // Earning | EmployeeDeduction | EmployerCost
            $table->string('code', 48);
            $table->string('label', 160);
            $table->bigInteger('amount_centavos');
            $table->string('source', 48);
            $table->boolean('is_taxable')->nullable();
            $table->string('adjustment_key', 120)->nullable();
            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->unique(['payroll_entry_id', 'adjustment_key'], 'pay_line_adj_key_uq');
            $table->index(['payroll_entry_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_line_items');
        Schema::dropIfExists('payroll_entries');
    }
};

