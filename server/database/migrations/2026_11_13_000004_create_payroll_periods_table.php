<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_periods', function (Blueprint $table): void {
            $table->id();
            $table->string('label', 120);
            $table->string('schedule_type', 20); // Monthly | Semimonthly | Weekly
            $table->date('period_start');
            $table->date('period_end');
            $table->date('pay_date');
            $table->unsignedTinyInteger('semimonthly_half')->nullable(); // 1 or 2 when Semimonthly
            $table->string('statutory_allocation_mode', 32)->default('HALF_HALF');
            $table->string('status', 24)->default('Draft'); // Draft | Calculated | Under Review | Approved | Locked
            $table->string('business_timezone', 64)->default('Asia/Manila');
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_notes')->nullable();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->text('approval_notes')->nullable();
            $table->foreignId('locked_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('locked_at')->nullable();
            $table->text('returned_reason')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();

            $table->index(['schedule_type', 'period_start', 'period_end'], 'pay_period_schedule_idx');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_periods');
    }
};

