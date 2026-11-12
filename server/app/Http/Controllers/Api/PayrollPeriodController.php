<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Payroll\CreatePayrollPeriodRequest;
use App\Http\Requests\Payroll\ReturnPayrollPeriodRequest;
use App\Http\Transformers\PayrollPresenter;
use App\Models\PayrollPeriod;
use App\Services\Payroll\PayrollWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayrollPeriodController extends Controller
{
    public function __construct(
        private readonly PayrollWorkflowService $workflow,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', PayrollPeriod::class);

        $periods = PayrollPeriod::query()
            ->with(['createdBy.employee', 'reviewedBy.employee', 'approvedBy.employee', 'lockedBy.employee'])
            ->orderByDesc('period_start')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PayrollPeriod $period): array => PayrollPresenter::period($period))
            ->values();

        return response()->json(['periods' => $periods]);
    }

    public function store(CreatePayrollPeriodRequest $request): JsonResponse
    {
        $this->authorize('create', PayrollPeriod::class);

        $period = $this->workflow->createPeriod(
            $request->validated(),
            $request->user(),
            $request->ip(),
        );

        return response()->json([
            'period' => PayrollPresenter::period($period->load('createdBy.employee')),
        ], 201);
    }

    public function entries(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->authorize('viewAny', PayrollPeriod::class);

        $entries = $period->entries()
            ->with(['employee', 'lineItems', 'payrollPeriod'])
            ->get()
            ->sortBy(fn ($entry) => $entry->employee->full_name)
            ->values()
            ->map(fn ($entry): array => PayrollPresenter::entry($entry));

        return response()->json(['entries' => $entries]);
    }

    public function calculate(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->authorize('calculate', $period);

        $result = $this->workflow->generateAndCalculate($period, $request->user(), $request->ip());

        $entries = $result['period']->entries()
            ->with(['employee', 'lineItems', 'payrollPeriod'])
            ->get()
            ->sortBy(fn ($entry) => $entry->employee->full_name)
            ->values()
            ->map(fn ($entry): array => PayrollPresenter::entry($entry));

        return response()->json([
            'period' => PayrollPresenter::period($result['period']),
            'generatedEntries' => $entries,
            'addedCount' => $result['addedCount'],
            'preservedExistingCount' => $result['preservedExistingCount'],
            'missingCompensationWarnings' => $result['missingCompensationWarnings'],
        ]);
    }

    public function submitForReview(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->authorize('review', $period);

        $validated = $request->validate([
            'review_notes' => ['nullable', 'string', 'max:500'],
        ]);

        $updated = $this->workflow->submitForReview(
            $period,
            $request->user(),
            $validated['review_notes'] ?? null,
            $request->ip(),
        );

        return response()->json([
            'period' => PayrollPresenter::period($updated),
        ]);
    }

    public function returnForCorrection(ReturnPayrollPeriodRequest $request, PayrollPeriod $period): JsonResponse
    {
        if (! $request->user()->hasPermission('payroll.approve') && ! $request->user()->hasPermission('payroll.review')) {
            abort(403, 'Unauthorized to return payroll period.');
        }

        $updated = $this->workflow->returnForCorrection(
            $period,
            $request->user(),
            (string) $request->validated()['reason'],
            $request->ip(),
        );

        return response()->json([
            'period' => PayrollPresenter::period($updated),
        ]);
    }

    public function approve(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->authorize('approve', $period);

        $validated = $request->validate([
            'approval_notes' => ['nullable', 'string', 'max:500'],
            'expected_version' => ['nullable', 'integer', 'min:1'],
        ]);

        $updated = $this->workflow->approvePeriod(
            $period,
            $request->user(),
            $validated['approval_notes'] ?? null,
            isset($validated['expected_version']) ? (int) $validated['expected_version'] : null,
            $request->ip(),
        );

        return response()->json([
            'period' => PayrollPresenter::period($updated),
        ]);
    }

    public function lock(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->authorize('lock', $period);

        $validated = $request->validate([
            'expected_version' => ['nullable', 'integer', 'min:1'],
        ]);

        $updated = $this->workflow->lockPeriod(
            $period,
            $request->user(),
            isset($validated['expected_version']) ? (int) $validated['expected_version'] : null,
            $request->ip(),
        );

        return response()->json([
            'period' => PayrollPresenter::period($updated),
        ]);
    }
}

