<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_compensations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->string('pay_basis', 16); // Monthly | Daily | Hourly
            $table->bigInteger('base_amount_centavos');
            $table->string('currency', 3)->default('PHP');
            $table->json('allowances_json');
            $table->boolean('statutory_eligible')->default(true);
            $table->date('effective_date');
            $table->date('end_date')->nullable();
            $table->string('status', 20)->default('Active'); // Active | Superseded | Inactive
            $table->text('notes')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['employee_id', 'effective_date', 'status'], 'emp_comp_effective_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_compensations');
    }
};

