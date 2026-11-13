<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendances', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->restrictOnDelete();
            $table->date('attendance_date'); // Asia/Manila clock-in business date
            $table->timestamp('clock_in_at_utc');
            $table->timestamp('clock_out_at_utc')->nullable();
            $table->unsignedInteger('duration_minutes')->nullable();
            $table->string('status', 20)->default('Clocked In'); // Clocked In | Clocked Out
            $table->string('business_timezone', 64)->default('Asia/Manila');
            $table->string('notes', 500)->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'status'], 'att_emp_status_idx');
            $table->index(['attendance_date', 'employee_id'], 'att_date_emp_idx');
        });

        Schema::create('leave_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->restrictOnDelete();
            $table->string('leave_type', 48);
            $table->date('start_date');
            $table->date('end_date');
            $table->unsignedInteger('total_days');
            $table->text('reason');
            $table->string('status', 24)->default('Pending'); // Pending | Approved | Rejected | Cancelled
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at_utc')->nullable();
            $table->string('reviewer_note', 500)->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'status', 'start_date', 'end_date'], 'leave_emp_status_range_idx');
            $table->index(['status', 'start_date'], 'leave_status_start_idx');
        });

        Schema::create('leave_decision_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('leave_request_id')->constrained('leave_requests')->cascadeOnDelete();
            $table->string('action', 24); // Submitted | Approved | Rejected | Cancelled
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_employee_code', 32);
            $table->string('actor_name', 120);
            $table->string('actor_role', 32);
            $table->string('note', 500)->nullable();
            $table->timestamp('occurred_at_utc');
            $table->timestamps();

            $table->index(['leave_request_id', 'occurred_at_utc'], 'leave_log_req_time_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_decision_logs');
        Schema::dropIfExists('leave_requests');
        Schema::dropIfExists('attendances');
    }
};
