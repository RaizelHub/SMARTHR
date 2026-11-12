<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Payroll\CreateCompensationRequest;
use App\Http\Transformers\PayrollPresenter;
use App\Models\EmployeeCompensation;
use App\Services\Payroll\PayrollWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompensationController extends Controller
{
    public function __construct(
        private readonly PayrollWorkflowService $workflow,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', EmployeeCompensation::class);

        $records = EmployeeCompensation::query()
            ->with('employee')
            ->orderByDesc('effective_date')
            ->orderByDesc('id')
            ->get()
            ->map(fn (EmployeeCompensation $comp): array => PayrollPresenter::compensation($comp))
            ->values();

        return response()->json(['compensations' => $records]);
    }

    public function store(CreateCompensationRequest $request): JsonResponse
    {
        $this->authorize('create', EmployeeCompensation::class);

        $created = $this->workflow->createCompensation(
            $request->validated(),
            $request->user(),
            $request->ip(),
        );

        return response()->json([
            'compensation' => PayrollPresenter::compensation($created),
        ], 201);
    }
}

