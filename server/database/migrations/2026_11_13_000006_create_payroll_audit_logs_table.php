<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_audit_logs', function (Blueprint $table): void {
            $table->id();
            $table->string('event_type', 64);
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_employee_code', 32);
            $table->string('actor_role', 32);
            $table->string('target_employee_code', 32)->nullable();
            $table->foreignId('payroll_period_id')->nullable()->constrained('payroll_periods')->nullOnDelete();
            $table->foreignId('payroll_entry_id')->nullable()->constrained('payroll_entries')->nullOnDelete();
            $table->string('summary', 500);
            $table->json('metadata_json')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('occurred_at_utc');
            $table->timestamps();

            $table->index(['event_type', 'occurred_at_utc']);
            $table->index('payroll_period_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_audit_logs');
    }
};
