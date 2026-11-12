<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CompensationController;
use App\Http\Controllers\Api\EmployeeReferenceController;
use App\Http\Controllers\Api\PayrollEntryController;
use App\Http\Controllers\Api\PayrollPeriodController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:auth-login');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/employees', [EmployeeReferenceController::class, 'index']);

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

