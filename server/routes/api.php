<?php

use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CompensationController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\EmployeeReferenceController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\LeaveController;
use App\Http\Controllers\Api\PayrollEntryController;
use App\Http\Controllers\Api\PayrollPeriodController;
use App\Http\Controllers\Api\ReportController;
use Illuminate\Support\Facades\Route;

Route::get('/health', [HealthController::class, 'show']);

Route::prefix('auth')->group(function (): void {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:auth-login');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

Route::middleware(['auth:sanctum', 'active.employee'])->group(function (): void {
    // Organization reference directory for Payroll (requires employees.read_all)
    Route::get('/employees', [EmployeeReferenceController::class, 'index']);

    // Role-scoped Employee Management & RBAC administration endpoints
    Route::get('/employees/scoped', [EmployeeController::class, 'scopedIndex']);
    Route::post('/employees', [EmployeeController::class, 'store']);
    Route::patch('/employees/{identifier}', [EmployeeController::class, 'update']);
    Route::delete('/employees/{identifier}', [EmployeeController::class, 'destroy']);
    Route::patch('/employees/{identifier}/role', [EmployeeController::class, 'updateRole']);
    Route::get('/security-audit-logs', [EmployeeController::class, 'securityAuditLogs']);

    // Attendance self-service & role-scoped history
    Route::prefix('attendance')->group(function (): void {
        Route::get('/', [AttendanceController::class, 'index']);
        Route::get('/active', [AttendanceController::class, 'active']);
        Route::post('/clock-in', [AttendanceController::class, 'clockIn']);
        Route::post('/clock-out', [AttendanceController::class, 'clockOut']);
    });

    // Leave request submission, cancellation & manager/HR approval workflow
    Route::prefix('leave-requests')->group(function (): void {
        Route::get('/', [LeaveController::class, 'index']);
        Route::post('/', [LeaveController::class, 'store']);
        Route::post('/{leaveRequest}/cancel', [LeaveController::class, 'cancel']);
        Route::post('/{leaveRequest}/review', [LeaveController::class, 'review']);
    });

    // Scoped Analytics & CSV Export
    Route::prefix('reports')->group(function (): void {
        Route::get('/summary', [ReportController::class, 'summary']);
        Route::get('/export/{dataset}', [ReportController::class, 'exportCsv']);
    });

    // Payroll & Compensation
    Route::prefix('payroll')->middleware('throttle:payroll-sensitive')->group(function (): void {
        Route::get('/statutory-rules', [PayrollEntryController::class, 'statutoryRules']);
        Route::get('/audit-logs', [PayrollEntryController::class, 'auditLogs']);

        Route::get('/compensations', [CompensationController::class, 'index']);
        Route::post('/compensations', [CompensationController::class, 'store']);

        Route::get('/periods', [PayrollPeriodController::class, 'index']);
        Route::post('/periods', [PayrollPeriodController::class, 'store']);
        Route::get('/periods/{period}/entries', [PayrollPeriodController::class, 'entries']);
        Route::post('/periods/{period}/calculate', [PayrollPeriodController::class, 'calculate']);
        Route::post('/periods/{period}/submit-review', [PayrollPeriodController::class, 'submitForReview']);
        Route::post('/periods/{period}/return', [PayrollPeriodController::class, 'returnForCorrection']);
        Route::post('/periods/{period}/approve', [PayrollPeriodController::class, 'approve']);
        Route::post('/periods/{period}/lock', [PayrollPeriodController::class, 'lock']);

        Route::patch('/entries/{entry}/units', [PayrollEntryController::class, 'setUnits']);
        Route::post('/entries/{entry}/adjustments', [PayrollEntryController::class, 'addAdjustment']);

        Route::get('/payslips/me', [PayrollEntryController::class, 'myPayslips']);
        Route::get('/payslips/{entry}', [PayrollEntryController::class, 'showPayslip']);
        Route::get('/payslips/{entry}/pdf', [PayrollEntryController::class, 'downloadPayslipPdf']);
    });
});
