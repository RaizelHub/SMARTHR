<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Payroll\AddManualAdjustmentRequest;
use App\Http\Requests\Payroll\SetPayableUnitsRequest;
use App\Http\Transformers\PayrollPresenter;
use App\Models\PayrollAuditLog;
use App\Models\PayrollEntry;
use App\Models\PayrollStatutoryRuleVersion;
use App\Services\Payroll\MoneyMath;
use App\Services\Payroll\PayrollWorkflowService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class PayrollEntryController extends Controller
{
    public function __construct(
        private readonly PayrollWorkflowService $workflow,
    ) {}

    public function setUnits(SetPayableUnitsRequest $request, PayrollEntry $entry): JsonResponse
    {
        $updated = $this->workflow->setConfirmedPayableUnits(
            $entry,
            (string) $request->validated()['units_input'],
            $request->user(),
            $request->ip(),
        );

        return response()->json([
            'entry' => PayrollPresenter::entry($updated),
        ]);
    }

    public function addAdjustment(AddManualAdjustmentRequest $request, PayrollEntry $entry): JsonResponse
    {
        $updated = $this->workflow->addManualAdjustment(
            $entry,
            $request->validated(),
            $request->user(),
            $request->ip(),
        );

        return response()->json([
            'entry' => PayrollPresenter::entry($updated),
        ]);
    }

    public function myPayslips(Request $request): JsonResponse
    {
        $user = $request->user()->load('employee');
        if (! $user->hasPermission('payroll.view_own')) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You do not have permission to view personal payslips.',
            ], 403);
        }

        $empId = $user->employee?->id;
        if (! $empId) {
            return response()->json(['payslips' => []]);
        }

        $slips = PayrollEntry::query()
            ->where('employee_id', $empId)
            ->with(['employee', 'lineItems', 'payrollPeriod'])
            ->orderByDesc('id')
            ->get()
            ->map(fn (PayrollEntry $entry): array => PayrollPresenter::entry($entry))
            ->values();

        return response()->json(['payslips' => $slips]);
    }

    public function showPayslip(Request $request, PayrollEntry $entry): JsonResponse
    {
        $this->authorize('view', $entry);

        return response()->json([
            'payslip' => PayrollPresenter::entry($entry->load(['employee', 'lineItems', 'payrollPeriod'])),
        ]);
    }

    public function downloadPayslipPdf(Request $request, PayrollEntry $entry): Response
    {
        $this->authorize('downloadPdf', $entry);

        $entry->load(['employee', 'lineItems', 'payrollPeriod']);
        $presented = PayrollPresenter::entry($entry);

        $pdf = Pdf::loadView('payslips.pdf', [
            'payslip' => $presented,
            'formatPhp' => fn (int $centavos): string => MoneyMath::formatPhp($centavos),
        ])->setPaper('a4');

        $filename = sprintf(
            'smarthr-payslip-%s-%s.pdf',
            $entry->employee->employee_code,
            $entry->payrollPeriod->period_end->format('Y-m-d'),
        );

        return $pdf->download($filename);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        if (! $request->user()?->hasPermission('payroll.read')) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Unauthorized to access organization payroll audit history.',
            ], 403);
        }

        $logs = PayrollAuditLog::query()
            ->orderByDesc('occurred_at_utc')
            ->orderByDesc('id')
            ->limit(200)
            ->get()
            ->map(fn (PayrollAuditLog $log): array => PayrollPresenter::auditLog($log))
            ->values();

        return response()->json(['auditLogs' => $logs]);
    }

    public function statutoryRules(): JsonResponse
    {
        $rules = PayrollStatutoryRuleVersion::query()
            ->where('is_active', true)
            ->orderBy('agency')
            ->get();

        return response()->json(['statutoryRules' => $rules]);
    }
}
