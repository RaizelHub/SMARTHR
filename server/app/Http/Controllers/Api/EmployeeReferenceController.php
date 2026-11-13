<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Transformers\PayrollPresenter;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeReferenceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if (! $request->user()?->hasPermission('employees.read_all')) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You are not authorized to list the organization employee directory.',
            ], 403);
        }

        $employees = Employee::query()
            ->orderBy('employee_code')
            ->get()
            ->map(fn (Employee $emp): array => PayrollPresenter::employeeReference($emp))
            ->values();

        return response()->json(['employees' => $employees]);
    }
}
