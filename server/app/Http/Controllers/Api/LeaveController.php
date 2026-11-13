<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Transformers\PayrollPresenter;
use App\Models\Employee;
use App\Models\LeaveDecisionLog;
use App\Models\LeaveRequest;
use App\Models\User;
use App\Services\SecurityAuditRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class LeaveController extends Controller
{
    private const LEAVE_TYPES = [
        'Annual Leave',
        'Sick Leave',
        'Emergency Leave',
        'Unpaid Leave',
        'Parental Leave',
        'Other Authorized Leave',
    ];

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load('employee');
        $actorEmp = $user->employee;

        if (! $actorEmp) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Employee profile required.',
            ], 403);
        }

        $query = LeaveRequest::query()->with(['employee', 'reviewedBy.employee', 'decisionLogs']);

        if ($user->hasPermission('leave.read_all')) {
            // Organization scope
        } elseif ($user->hasPermission('leave.read_team')) {
            $dept = $actorEmp->department;
            $empId = $actorEmp->id;
            $query->where(function ($q) use ($dept, $empId): void {
                $q->where('employee_id', $empId)
                    ->orWhereHas('employee', fn ($eq) => $eq->where('department', $dept));
            });
        } elseif ($user->hasPermission('leave.read_own')) {
            $query->where('employee_id', $actorEmp->id);
        } else {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You do not have permission to view leave requests.',
            ], 403);
        }

        $requests = $query
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (LeaveRequest $leave): array => PayrollPresenter::leaveRequest($leave))
            ->values();

        return response()->json(['requests' => $requests]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load('employee');
        $actorEmp = $user->employee;

        if (! $actorEmp || ! $user->hasPermission('leave.request')) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Your role does not have permission to submit leave requests.',
            ], 403);
        }

        $requestedCode = trim((string) $request->input('employeeId', ''));
        if ($requestedCode !== '' && strtoupper($requestedCode) !== strtoupper($actorEmp->employee_code)) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You are not authorized to submit a leave request for another employee.',
            ], 403);
        }

        $validated = $request->validate([
            'leaveType' => ['required', Rule::in(self::LEAVE_TYPES)],
            'startDate' => ['required', 'date_format:Y-m-d'],
            'endDate' => ['required', 'date_format:Y-m-d', 'after_or_equal:startDate'],
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        $start = CarbonImmutable::createFromFormat('Y-m-d', $validated['startDate'], 'Asia/Manila')->startOfDay();
        $end = CarbonImmutable::createFromFormat('Y-m-d', $validated['endDate'], 'Asia/Manila')->startOfDay();
        $totalDays = (int) $start->diffInDays($end) + 1;

        if ($totalDays > 365) {
            return response()->json([
                'code' => 'VALIDATION_ERROR',
                'message' => 'Single leave request cannot exceed 365 calendar days.',
                'errors' => ['endDate' => ['Single leave request cannot exceed 365 calendar days.']],
            ], 422);
        }

        $result = DB::transaction(function () use ($user, $actorEmp, $validated, $totalDays): array {
            /** @var Employee $lockedEmp */
            $lockedEmp = Employee::query()->whereKey($actorEmp->id)->lockForUpdate()->firstOrFail();

            if ($lockedEmp->employment_status === 'Inactive') {
                return [
                    'status' => 403,
                    'body' => [
                        'code' => 'EMPLOYEE_INACTIVE',
                        'message' => 'Inactive employees cannot submit new leave requests.',
                    ],
                ];
            }

            $activeRequests = LeaveRequest::query()
                ->where('employee_id', $lockedEmp->id)
                ->whereIn('status', [LeaveRequest::STATUS_PENDING, LeaveRequest::STATUS_APPROVED])
                ->lockForUpdate()
                ->get();

            foreach ($activeRequests as $existing) {
                $existingStart = $existing->start_date->format('Y-m-d');
                $existingEnd = $existing->end_date->format('Y-m-d');

                if ($existing->leave_type === $validated['leaveType']
                    && $existingStart === $validated['startDate']
                    && $existingEnd === $validated['endDate']) {
                    return [
                        'status' => 409,
                        'body' => [
                            'code' => 'DUPLICATE_LEAVE_REQUEST',
                            'message' => "Duplicate leave request: an active {$existing->status} {$existing->leave_type} request already exists for {$existingStart} to {$existingEnd}.",
                            'errors' => ['startDate' => ["Duplicate leave request already exists for {$existingStart} to {$existingEnd}."]],
                        ],
                    ];
                }

                if ($validated['startDate'] <= $existingEnd && $validated['endDate'] >= $existingStart) {
                    return [
                        'status' => 409,
                        'body' => [
                            'code' => 'OVERLAPPING_LEAVE_REQUEST',
                            'message' => "Dates overlap with an existing {$existing->status} request ({$existingStart} to {$existingEnd}).",
                            'errors' => ['startDate' => ["Dates overlap with an existing {$existing->status} request ({$existingStart} to {$existingEnd})."]],
                        ],
                    ];
                }
            }

            $nowUtc = now('UTC');
            $created = LeaveRequest::query()->create([
                'employee_id' => $lockedEmp->id,
                'leave_type' => $validated['leaveType'],
                'start_date' => $validated['startDate'],
                'end_date' => $validated['endDate'],
                'total_days' => $totalDays,
                'reason' => trim($validated['reason']),
                'status' => LeaveRequest::STATUS_PENDING,
            ]);

            LeaveDecisionLog::query()->create([
                'leave_request_id' => $created->id,
                'action' => 'Submitted',
                'actor_user_id' => $user->id,
                'actor_employee_code' => $lockedEmp->employee_code,
                'actor_name' => $lockedEmp->full_name,
                'actor_role' => $lockedEmp->assigned_role,
                'note' => trim($validated['reason']),
                'occurred_at_utc' => $nowUtc,
            ]);

            $created->load(['employee', 'reviewedBy.employee', 'decisionLogs']);

            return [
                'status' => 201,
                'body' => [
                    'request' => PayrollPresenter::leaveRequest($created),
                ],
            ];
        });

        return response()->json($result['body'], $result['status']);
    }

    public function cancel(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load('employee');
        $actorEmp = $user->employee;

        if (! $actorEmp || ! $user->hasPermission('leave.request')) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You do not have permission to cancel leave requests.',
            ], 403);
        }

        $note = trim((string) $request->input('note', ''));

        $result = DB::transaction(function () use ($user, $actorEmp, $leaveRequest, $note): array {
            /** @var LeaveRequest $locked */
            $locked = LeaveRequest::query()->whereKey($leaveRequest->id)->lockForUpdate()->firstOrFail();

            if ((int) $locked->employee_id !== (int) $actorEmp->id) {
                return [
                    'status' => 403,
                    'body' => [
                        'code' => 'UNAUTHORIZED',
                        'message' => 'You are only authorized to cancel your own leave requests.',
                    ],
                ];
            }

            if ($locked->status !== LeaveRequest::STATUS_PENDING) {
                return [
                    'status' => 409,
                    'body' => [
                        'code' => 'INVALID_STATUS_TRANSITION',
                        'message' => "Only Pending leave requests can be cancelled (current status: {$locked->status}).",
                    ],
                ];
            }

            $locked->update([
                'status' => LeaveRequest::STATUS_CANCELLED,
            ]);

            LeaveDecisionLog::query()->create([
                'leave_request_id' => $locked->id,
                'action' => 'Cancelled',
                'actor_user_id' => $user->id,
                'actor_employee_code' => $actorEmp->employee_code,
                'actor_name' => $actorEmp->full_name,
                'actor_role' => $actorEmp->assigned_role,
                'note' => $note !== '' ? $note : null,
                'occurred_at_utc' => now('UTC'),
            ]);

            $locked->load(['employee', 'reviewedBy.employee', 'decisionLogs']);

            return [
                'status' => 200,
                'body' => [
                    'request' => PayrollPresenter::leaveRequest($locked),
                ],
            ];
        });

        return response()->json($result['body'], $result['status']);
    }

    public function review(Request $request, LeaveRequest $leaveRequest): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load('employee');
        $actorEmp = $user->employee;

        $validated = $request->validate([
            'decision' => ['required', Rule::in([LeaveRequest::STATUS_APPROVED, LeaveRequest::STATUS_REJECTED])],
            'reviewerNote' => ['nullable', 'string', 'max:500'],
        ]);

        $decision = $validated['decision'];
        $requiredPerm = $decision === LeaveRequest::STATUS_APPROVED ? 'leave.approve' : 'leave.reject';

        if (! $actorEmp || ! $user->hasPermission($requiredPerm)) {
            SecurityAuditRecorder::record(
                'LEAVE_REVIEW_DENIED',
                $user,
                null,
                "Denied attempt to {$decision} leave request #{$leaveRequest->id}",
                $request->ip(),
            );

            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Only Managers or HR personnel can review leave requests.',
            ], 403);
        }

        $note = trim((string) ($validated['reviewerNote'] ?? ''));

        $result = DB::transaction(function () use ($user, $actorEmp, $leaveRequest, $decision, $note, $request): array {
            /** @var LeaveRequest $locked */
            $locked = LeaveRequest::query()
                ->with('employee')
                ->whereKey($leaveRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ((int) $locked->employee_id === (int) $actorEmp->id) {
                SecurityAuditRecorder::record(
                    'LEAVE_SELF_APPROVAL_BLOCKED',
                    $user,
                    $actorEmp->employee_code,
                    "Blocked self-review attempt on leave request #{$locked->id}",
                    $request->ip(),
                );

                return [
                    'status' => 403,
                    'body' => [
                        'code' => 'UNAUTHORIZED',
                        'message' => 'Reviewers cannot approve or reject their own leave requests.',
                    ],
                ];
            }

            if (! $user->hasPermission('leave.read_all') && $locked->employee?->department !== $actorEmp->department) {
                return [
                    'status' => 403,
                    'body' => [
                        'code' => 'UNAUTHORIZED',
                        'message' => 'Managers can only review leave requests within their department.',
                    ],
                ];
            }

            if ($locked->status !== LeaveRequest::STATUS_PENDING) {
                return [
                    'status' => 409,
                    'body' => [
                        'code' => 'INVALID_STATUS_TRANSITION',
                        'message' => "Leave request is already {$locked->status} and cannot transition to {$decision}.",
                    ],
                ];
            }

            $nowUtc = now('UTC');
            $locked->update([
                'status' => $decision,
                'reviewed_by_user_id' => $user->id,
                'reviewed_at_utc' => $nowUtc,
                'reviewer_note' => $note !== '' ? $note : null,
            ]);

            LeaveDecisionLog::query()->create([
                'leave_request_id' => $locked->id,
                'action' => $decision,
                'actor_user_id' => $user->id,
                'actor_employee_code' => $actorEmp->employee_code,
                'actor_name' => $actorEmp->full_name,
                'actor_role' => $actorEmp->assigned_role,
                'note' => $note !== '' ? $note : null,
                'occurred_at_utc' => $nowUtc,
            ]);

            $locked->load(['employee', 'reviewedBy.employee', 'decisionLogs']);

            return [
                'status' => 200,
                'body' => [
                    'request' => PayrollPresenter::leaveRequest($locked),
                ],
            ];
        });

        return response()->json($result['body'], $result['status']);
    }
}
