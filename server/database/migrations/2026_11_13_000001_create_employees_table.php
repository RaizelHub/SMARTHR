<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
            $table->string('employee_code', 32)->unique();
            $table->string('full_name', 120);
            $table->string('work_email', 160)->unique();
            $table->string('department', 80);
            $table->string('position', 100);
            $table->string('employment_status', 24)->default('Active');
            $table->string('assigned_role', 32)->default('Employee');
            $table->boolean('is_minimum_wage_earner')->default(false);
            $table->date('hire_date');
            $table->timestamps();

            $table->index(['employment_status', 'assigned_role']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};
