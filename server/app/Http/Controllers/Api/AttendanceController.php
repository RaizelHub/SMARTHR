<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Transformers\PayrollPresenter;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AttendanceController extends Controller
{
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

        $query = Attendance::query()->with('employee');

        if ($user->hasPermission('attendance.read_all')) {
            // Organization scope
        } elseif ($user->hasPermission('attendance.read_team')) {
            $dept = $actorEmp->department;
            $empId = $actorEmp->id;
            $query->where(function ($q) use ($dept, $empId): void {
                $q->where('employee_id', $empId)
                    ->orWhereHas('employee', fn ($eq) => $eq->where('department', $dept));
            });
        } elseif ($user->hasPermission('attendance.read_own')) {
            $query->where('employee_id', $actorEmp->id);
        } else {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You do not have permission to view attendance records.',
            ], 403);
        }

        $records = $query
            ->orderByDesc('clock_in_at_utc')
            ->orderByDesc('id')
            ->get()
            ->map(fn (Attendance $att): array => PayrollPresenter::attendance($att))
            ->values();

        return response()->json(['records' => $records]);
    }

    public function active(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load('employee');
        $actorEmp = $user->employee;

        if (! $actorEmp || ! $user->hasPermission('attendance.read_own')) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You do not have permission to read active attendance status.',
            ], 403);
        }

        $requestedCode = trim((string) $request->query('employeeId', ''));
        if ($requestedCode !== '' && strtoupper($requestedCode) !== strtoupper($actorEmp->employee_code)) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You can only inspect your own active attendance status here.',
            ], 403);
        }

        $session = Attendance::query()
            ->with('employee')
            ->where('employee_id', $actorEmp->id)
            ->where('status', 'Clocked In')
            ->whereNull('clock_out_at_utc')
            ->orderByDesc('clock_in_at_utc')
            ->first();

        return response()->json([
            'session' => $session ? PayrollPresenter::attendance($session) : null,
        ]);
    }

    public function clockIn(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load('employee');
        $actorEmp = $user->employee;

        if (! $actorEmp || ! $user->hasPermission('attendance.record_own')) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Your role does not have permission to record attendance.',
            ], 403);
        }

        $requestedCode = trim((string) $request->input('employeeId', ''));
        if ($requestedCode !== '' && strtoupper($requestedCode) !== strtoupper($actorEmp->employee_code)) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You are not authorized to submit attendance for another employee.',
            ], 403);
        }

        $result = DB::transaction(function () use ($actorEmp): array {
            /** @var Employee $lockedEmp */
            $lockedEmp = Employee::query()->whereKey($actorEmp->id)->lockForUpdate()->firstOrFail();

            if ($lockedEmp->employment_status === 'Inactive') {
                return [
                    'status' => 403,
                    'body' => [
                        'code' => 'EMPLOYEE_INACTIVE',
                        'message' => 'Inactive employees cannot clock in to start a work session.',
                    ],
                ];
            }

            $existingActive = Attendance::query()
                ->where('employee_id', $lockedEmp->id)
                ->where('status', 'Clocked In')
                ->whereNull('clock_out_at_utc')
                ->exists();

            if ($existingActive) {
                return [
                    'status' => 409,
                    'body' => [
                        'code' => 'DUPLICATE_CLOCK_IN',
                        'message' => "{$lockedEmp->full_name} ({$lockedEmp->employee_code}) already has an active clock-in session.",
                    ],
                ];
            }

            // Server-authoritative UTC clock + Asia/Manila business shift attribution date (immutable to avoid mutating UTC value)
            $clockInUtc = now('UTC')->toImmutable();
            $manilaDate = $clockInUtc->setTimezone('Asia/Manila')->format('Y-m-d');

            $created = Attendance::query()->create([
                'employee_id' => $lockedEmp->id,
                'attendance_date' => $manilaDate,
                'clock_in_at_utc' => $clockInUtc->setTimezone('UTC'),
                'clock_out_at_utc' => null,
                'duration_minutes' => null,
                'status' => 'Clocked In',
                'business_timezone' => 'Asia/Manila',
            ]);

            $created->setRelation('employee', $lockedEmp);

            return [
                'status' => 201,
                'body' => [
                    'record' => PayrollPresenter::attendance($created),
                ],
            ];
        });

        return response()->json($result['body'], $result['status']);
    }

    public function clockOut(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load('employee');
        $actorEmp = $user->employee;

        if (! $actorEmp || ! $user->hasPermission('attendance.record_own')) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Your role does not have permission to record attendance.',
            ], 403);
        }

        $requestedCode = trim((string) $request->input('employeeId', ''));
        if ($requestedCode !== '' && strtoupper($requestedCode) !== strtoupper($actorEmp->employee_code)) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'You are not authorized to modify attendance for another employee.',
            ], 403);
        }

        $sessionId = $request->input('sessionId');

        $result = DB::transaction(function () use ($actorEmp, $sessionId): array {
            /** @var Employee $lockedEmp */
            $lockedEmp = Employee::query()->whereKey($actorEmp->id)->lockForUpdate()->firstOrFail();

            if ($sessionId !== null && $sessionId !== '') {
                $target = Attendance::query()
                    ->where('id', (int) $sessionId)
                    ->where('employee_id', $lockedEmp->id)
                    ->lockForUpdate()
                    ->first();

                if (! $target) {
                    return [
                        'status' => 404,
                        'body' => [
                            'code' => 'NO_ACTIVE_SESSION',
                            'message' => 'No matching active clock-in session was found to clock out.',
                        ],
                    ];
                }

                if ($target->status === 'Clocked Out') {
                    return [
                        'status' => 409,
                        'body' => [
                            'code' => 'DUPLICATE_CLOCK_OUT',
                            'message' => 'This attendance session has already been clocked out.',
                        ],
                    ];
                }

                $active = $target;
            } else {
                $active = Attendance::query()
                    ->where('employee_id', $lockedEmp->id)
                    ->where('status', 'Clocked In')
                    ->whereNull('clock_out_at_utc')
                    ->orderByDesc('clock_in_at_utc')
                    ->lockForUpdate()
                    ->first();

                if (! $active) {
                    $hasPrior = Attendance::query()->where('employee_id', $lockedEmp->id)->exists();

                    return [
                        'status' => $hasPrior ? 409 : 404,
                        'body' => [
                            'code' => $hasPrior ? 'DUPLICATE_CLOCK_OUT' : 'NO_ACTIVE_SESSION',
                            'message' => $hasPrior
                                ? "{$lockedEmp->full_name} is already clocked out. Clock in to begin a new session."
                                : 'Cannot clock out without an active clock-in session.',
                        ],
                    ];
                }
            }

            $clockOutUtc = now('UTC');
            if ($clockOutUtc->lt($active->clock_in_at_utc)) {
                return [
                    'status' => 400,
                    'body' => [
                        'code' => 'INVALID_TIMESTAMP_ORDER',
                        'message' => 'Clock-out timestamp cannot be earlier than the active clock-in timestamp.',
                    ],
                ];
            }

            $durationMinutes = (int) floor($active->clock_in_at_utc->diffInMinutes($clockOutUtc));

            $active->update([
                'clock_out_at_utc' => $clockOutUtc,
                'duration_minutes' => $durationMinutes,
                'status' => 'Clocked Out',
            ]);

            $active->setRelation('employee', $lockedEmp);

            return [
                'status' => 200,
                'body' => [
                    'record' => PayrollPresenter::attendance($active->fresh('employee')),
                ],
            ];
        });

        return response()->json($result['body'], $result['status']);
    }
}
