<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\User;
use App\Services\SecurityAuditRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;

class ReportController extends Controller
{
    private const MAX_EXPORT_ROWS = 5000;

    private const DEPARTMENTS = [
        'Engineering',
        'Human Resources',
        'Finance',
        'Operations',
        'Product',
        'Sales',
        'Customer Support',
    ];

    private const EMPLOYMENT_STATUSES = [
        'Active',
        'Probation',
        'On Leave',
        'Inactive',
    ];

    private const LEAVE_TYPES = [
        'Annual Leave',
        'Sick Leave',
        'Emergency Leave',
        'Unpaid Leave',
        'Parental Leave',
        'Other Authorized Leave',
    ];

    private const LEAVE_STATUSES = [
        'Pending',
        'Approved',
        'Rejected',
        'Cancelled',
    ];

    private const METRIC_DEFINITIONS = [
        [
            'metric' => 'Total Workforce (Filtered Directory)',
            'definition' => 'Count of employee directory records matching the active Department, Employee, and Employment Status filters within your authorized role scope.',
        ],
        [
            'metric' => 'New Hires in Period',
            'definition' => 'Count of filtered employees whose hireDate (YYYY-MM-DD) falls inclusively within the selected Start Date and End Date filters.',
        ],
        [
            'metric' => 'Attendance Sessions & Attribution Date',
            'definition' => 'Each attendance record is attributed once to its Asia/Manila clock-in calendar date (attendanceDate). Overnight shifts crossing midnight are counted on their clock-in shift date only and never double-counted.',
        ],
        [
            'metric' => 'Raw Recorded Shift Duration',
            'definition' => 'Sum of elapsed minutes for completed Clocked Out sessions (excluding open Clocked In sessions without clockOutAtUtc). Raw duration is not equivalent to payable, regular, or overtime payroll hours.',
        ],
        [
            'metric' => 'Absences & Tardiness',
            'definition' => 'Not calculated. Company work schedules, shift start/end times, and absence/tardiness rules are not configured in Smart HR.',
        ],
        [
            'metric' => 'Leave Requests & Overlap Filtering',
            'definition' => 'Leave requests are counted once when their [startDate, endDate] overlaps the selected report date range. Cancelled and Rejected requests are tracked separately from Approved requests.',
        ],
        [
            'metric' => 'Leave Balances & Entitlements',
            'definition' => 'Not calculated. Approved calendar days represent total inclusive calendar dates requested without weekend/holiday exclusions or balance deductions.',
        ],
    ];

    public function summary(Request $request): JsonResponse
    {
        $resolved = $this->buildScopedReport($request);
        if ($resolved instanceof JsonResponse) {
            return $resolved;
        }

        return response()->json(['report' => $resolved]);
    }

    public function exportCsv(Request $request, string $dataset): JsonResponse|Response
    {
        if (! in_array($dataset, ['employees', 'attendance', 'leave'], true)) {
            return response()->json([
                'code' => 'VALIDATION_ERROR',
                'message' => "Unsupported export dataset \"{$dataset}\".",
            ], 400);
        }

        /** @var User $user */
        $user = $request->user()->load('employee');
        if (! $user->hasPermission('reports.export')) {
            SecurityAuditRecorder::record(
                'REPORT_EXPORT_DENIED',
                $user,
                null,
                "Denied attempt to export {$dataset} CSV report",
                $request->ip(),
            );

            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Your current role does not grant permission to export CSV reports.',
            ], 403);
        }

        $report = $this->buildScopedReport($request);
        if ($report instanceof JsonResponse) {
            return $report;
        }

        if ($dataset === 'employees') {
            $rowsData = $report['employeeAnalytics']['employees'];
            if (count($rowsData) > self::MAX_EXPORT_ROWS) {
                return response()->json([
                    'code' => 'EXPORT_LIMIT_EXCEEDED',
                    'message' => 'Employee CSV export exceeds the '.self::MAX_EXPORT_ROWS.'-row safety limit.',
                ], 400);
            }
            $csv = $this->buildEmployeeCsv($rowsData);
        } elseif ($dataset === 'attendance') {
            $rowsData = $report['attendanceAnalytics']['records'];
            if (count($rowsData) > self::MAX_EXPORT_ROWS) {
                return response()->json([
                    'code' => 'EXPORT_LIMIT_EXCEEDED',
                    'message' => 'Attendance CSV export exceeds the '.self::MAX_EXPORT_ROWS.'-row safety limit.',
                ], 400);
            }
            $csv = $this->buildAttendanceCsv($rowsData);
        } else {
            $rowsData = $report['leaveAnalytics']['requests'];
            if (count($rowsData) > self::MAX_EXPORT_ROWS) {
                return response()->json([
                    'code' => 'EXPORT_LIMIT_EXCEEDED',
                    'message' => 'Leave CSV export exceeds the '.self::MAX_EXPORT_ROWS.'-row safety limit.',
                ], 400);
            }
            $csv = $this->buildLeaveCsv($rowsData);
        }

        $businessDate = now('Asia/Manila')->format('Y-m-d');
        $filename = "smarthr-{$dataset}-report-{$businessDate}.csv";

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            'X-Export-Row-Count' => (string) count($rowsData),
        ]);
    }

    /**
     * @return array<string, mixed>|JsonResponse
     */
    private function buildScopedReport(Request $request): array|JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load('employee');
        $actorEmp = $user->employee;

        if (! $actorEmp) {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Employee profile required for reporting.',
            ], 403);
        }

        $scope = $user->hasPermission('reports.view_all')
            ? 'all'
            : ($user->hasPermission('reports.view_team')
                ? 'team'
                : ($user->hasPermission('reports.view_own') ? 'own' : 'none'));

        if ($scope === 'none') {
            return response()->json([
                'code' => 'UNAUTHORIZED',
                'message' => 'Your current role does not grant permission to view reports.',
            ], 403);
        }

        $startDate = trim((string) $request->query('startDate', ''));
        $endDate = trim((string) $request->query('endDate', ''));
        $department = trim((string) $request->query('department', 'All')) ?: 'All';
        $employeeIdFilter = trim((string) $request->query('employeeId', 'All')) ?: 'All';
        $employmentStatus = trim((string) $request->query('employmentStatus', 'All')) ?: 'All';
        $leaveStatus = trim((string) $request->query('leaveStatus', 'All')) ?: 'All';

        if ($startDate !== '' && ! $this->isValidDate($startDate)) {
            return response()->json([
                'code' => 'VALIDATION_ERROR',
                'message' => 'Start date must be a valid calendar date in YYYY-MM-DD format.',
            ], 400);
        }
        if ($endDate !== '' && ! $this->isValidDate($endDate)) {
            return response()->json([
                'code' => 'VALIDATION_ERROR',
                'message' => 'End date must be a valid calendar date in YYYY-MM-DD format.',
            ], 400);
        }
        if ($startDate !== '' && $endDate !== '' && $startDate > $endDate) {
            return response()->json([
                'code' => 'VALIDATION_ERROR',
                'message' => 'Start date cannot be later than end date.',
            ], 400);
        }
        if ($department !== 'All' && ! in_array($department, self::DEPARTMENTS, true)) {
            return response()->json([
                'code' => 'VALIDATION_ERROR',
                'message' => "Invalid department filter \"{$department}\".",
            ], 400);
        }
        if ($employmentStatus !== 'All' && ! in_array($employmentStatus, self::EMPLOYMENT_STATUSES, true)) {
            return response()->json([
                'code' => 'VALIDATION_ERROR',
                'message' => "Invalid employment status filter \"{$employmentStatus}\".",
            ], 400);
        }
        if ($leaveStatus !== 'All' && ! in_array($leaveStatus, self::LEAVE_STATUSES, true)) {
            return response()->json([
                'code' => 'VALIDATION_ERROR',
                'message' => "Invalid leave status filter \"{$leaveStatus}\".",
            ], 400);
        }

        $normalizedEmployeeFilter = $employeeIdFilter === 'All' ? 'All' : strtoupper($employeeIdFilter);

        // Enforce RBAC scope strictly server-side before returning/querying any aggregate data
        if ($scope === 'own') {
            if ($department !== 'All' && $department !== $actorEmp->department) {
                return response()->json([
                    'code' => 'UNAUTHORIZED',
                    'message' => 'You are only authorized to access reporting data for your own profile.',
                ], 403);
            }
            if ($normalizedEmployeeFilter !== 'All' && $normalizedEmployeeFilter !== strtoupper($actorEmp->employee_code)) {
                return response()->json([
                    'code' => 'UNAUTHORIZED',
                    'message' => 'You are not authorized to access reports for another employee.',
                ], 403);
            }
        } elseif ($scope === 'team') {
            if ($department !== 'All' && $department !== $actorEmp->department) {
                return response()->json([
                    'code' => 'UNAUTHORIZED',
                    'message' => "Managers can only view reports for their assigned department ({$actorEmp->department}).",
                ], 403);
            }
            if ($normalizedEmployeeFilter !== 'All') {
                $targetEmp = Employee::query()->whereRaw('UPPER(employee_code) = ?', [$normalizedEmployeeFilter])->first();
                if (! $targetEmp || $targetEmp->department !== $actorEmp->department) {
                    return response()->json([
                        'code' => 'UNAUTHORIZED',
                        'message' => "Managers cannot view reporting data for employees outside {$actorEmp->department}.",
                    ], 403);
                }
            }
        }

        $empQuery = Employee::query();
        $attQuery = Attendance::query()->with('employee');
        $lvQuery = LeaveRequest::query()->with(['employee', 'reviewedBy.employee']);

        if ($scope === 'own') {
            $empQuery->whereKey($actorEmp->id);
            $attQuery->where('employee_id', $actorEmp->id);
            $lvQuery->where('employee_id', $actorEmp->id);
        } elseif ($scope === 'team') {
            $dept = $actorEmp->department;
            $empQuery->where('department', $dept);
            $attQuery->whereHas('employee', fn ($q) => $q->where('department', $dept));
            $lvQuery->whereHas('employee', fn ($q) => $q->where('department', $dept));
        }

        /** @var Collection<int, Employee> $scopedEmployees */
        $scopedEmployees = $empQuery->orderBy('full_name')->get();
        /** @var Collection<int, Attendance> $scopedAttendance */
        $scopedAttendance = $attQuery->orderByDesc('clock_in_at_utc')->get();
        /** @var Collection<int, LeaveRequest> $scopedLeave */
        $scopedLeave = $lvQuery->orderByDesc('created_at')->get();

        $availableDepartments = $scope === 'all' ? self::DEPARTMENTS : [$actorEmp->department];
        $availableEmployees = $scopedEmployees->map(fn (Employee $e): array => [
            'employeeId' => $e->employee_code,
            'fullName' => $e->full_name,
            'department' => $e->department,
        ])->values()->all();

        $filters = [
            'startDate' => $startDate !== '' ? $startDate : null,
            'endDate' => $endDate !== '' ? $endDate : null,
            'department' => $department,
            'employeeId' => $normalizedEmployeeFilter,
            'employmentStatus' => $employmentStatus,
            'leaveStatus' => $leaveStatus,
        ];

        // 1. Employee Analytics
        $matchingEmployees = $scopedEmployees->filter(function (Employee $emp) use ($filters): bool {
            if ($filters['department'] !== 'All' && $emp->department !== $filters['department']) {
                return false;
            }
            if ($filters['employeeId'] !== 'All' && strtoupper($emp->employee_code) !== $filters['employeeId']) {
                return false;
            }
            if ($filters['employmentStatus'] !== 'All' && $emp->employment_status !== $filters['employmentStatus']) {
                return false;
            }

            return true;
        })->values();

        $employeeRows = [];
        $activeCount = 0;
        $probationCount = 0;
        $onLeaveCount = 0;
        $inactiveCount = 0;
        $newHiresInPeriod = 0;
        $empDeptMap = [];
        $statusMap = array_fill_keys(self::EMPLOYMENT_STATUSES, 0);

        foreach ($matchingEmployees as $emp) {
            $hireDateStr = $emp->hire_date->format('Y-m-d');
            $hiredInRange = ($filters['startDate'] === null || $hireDateStr >= $filters['startDate'])
                && ($filters['endDate'] === null || $hireDateStr <= $filters['endDate']);

            if ($hiredInRange) {
                $newHiresInPeriod++;
            }

            $statusMap[$emp->employment_status] = ($statusMap[$emp->employment_status] ?? 0) + 1;

            if (! isset($empDeptMap[$emp->department])) {
                $empDeptMap[$emp->department] = [
                    'department' => $emp->department,
                    'totalCount' => 0,
                    'activeCount' => 0,
                    'probationCount' => 0,
                    'onLeaveStatusCount' => 0,
                    'inactiveCount' => 0,
                    'newHiresCount' => 0,
                ];
            }

            $empDeptMap[$emp->department]['totalCount']++;
            if ($hiredInRange) {
                $empDeptMap[$emp->department]['newHiresCount']++;
            }

            match ($emp->employment_status) {
                'Active' => [$activeCount++, $empDeptMap[$emp->department]['activeCount']++],
                'Probation' => [$probationCount++, $empDeptMap[$emp->department]['probationCount']++],
                'On Leave' => [$onLeaveCount++, $empDeptMap[$emp->department]['onLeaveStatusCount']++],
                'Inactive' => [$inactiveCount++, $empDeptMap[$emp->department]['inactiveCount']++],
                default => null,
            };

            $employeeRows[] = [
                'employeeId' => $emp->employee_code,
                'fullName' => $emp->full_name,
                'department' => $emp->department,
                'position' => $emp->position,
                'employmentStatus' => $emp->employment_status,
                'hireDate' => $hireDateStr,
                'assignedRole' => $emp->assigned_role,
            ];
        }

        usort($empDeptMap, fn (array $a, array $b): int => ($b['totalCount'] <=> $a['totalCount']) ?: strcmp($a['department'], $b['department']));

        $byEmploymentStatus = [];
        foreach (self::EMPLOYMENT_STATUSES as $st) {
            $byEmploymentStatus[] = ['status' => $st, 'count' => $statusMap[$st] ?? 0];
        }

        // 2. Attendance Analytics
        $matchingAttendance = [];
        foreach ($scopedAttendance as $att) {
            $owner = $att->employee;
            $ownerDept = $owner?->department ?? 'Unknown';
            $attDateStr = $att->attendance_date->format('Y-m-d');

            if ($filters['department'] !== 'All' && $ownerDept !== $filters['department']) {
                continue;
            }
            if ($filters['employeeId'] !== 'All' && strtoupper($owner?->employee_code ?? '') !== $filters['employeeId']) {
                continue;
            }
            if ($filters['employmentStatus'] !== 'All' && $owner?->employment_status !== $filters['employmentStatus']) {
                continue;
            }
            if ($filters['startDate'] !== null && $attDateStr < $filters['startDate']) {
                continue;
            }
            if ($filters['endDate'] !== null && $attDateStr > $filters['endDate']) {
                continue;
            }

            $clockInManila = $att->clock_in_at_utc->setTimezone('Asia/Manila')->format('Y-m-d');
            $clockOutManila = $att->clock_out_at_utc?->setTimezone('Asia/Manila')->format('Y-m-d');
            $isOvernight = $clockOutManila !== null && $clockOutManila !== $clockInManila;
            $missingClockOut = $att->status === 'Clocked In' && $att->clock_out_at_utc === null;

            $matchingAttendance[] = [
                'id' => (string) $att->id,
                'employeeId' => $owner?->employee_code ?? '',
                'employeeName' => $owner?->full_name ?? '',
                'department' => $ownerDept,
                'attendanceDate' => $attDateStr,
                'clockInAtUtc' => $att->clock_in_at_utc->toIso8601String(),
                'clockOutAtUtc' => $att->clock_out_at_utc?->toIso8601String(),
                'durationMinutes' => $att->duration_minutes,
                'status' => $att->status,
                'isOvernight' => $isOvernight,
                'missingClockOut' => $missingClockOut,
            ];
        }

        $completedSessions = 0;
        $missingClockOutCount = 0;
        $overnightSessionsCount = 0;
        $totalRecordedMinutes = 0;
        $dailyMap = [];
        $attDeptMap = [];
        $attEmpMap = [];

        foreach ($matchingAttendance as $row) {
            $isCompleted = $row['status'] === 'Clocked Out' && $row['durationMinutes'] !== null;
            $mins = $isCompleted ? (int) $row['durationMinutes'] : 0;

            if ($isCompleted) {
                $completedSessions++;
                $totalRecordedMinutes += $mins;
            }
            if ($row['missingClockOut']) {
                $missingClockOutCount++;
            }
            if ($row['isOvernight']) {
                $overnightSessionsCount++;
            }

            $d = $row['attendanceDate'];
            if (! isset($dailyMap[$d])) {
                $dailyMap[$d] = [
                    'attendanceDate' => $d,
                    'sessionCount' => 0,
                    'completedCount' => 0,
                    'missingClockOutCount' => 0,
                    'overnightCount' => 0,
                    'totalRecordedMinutes' => 0,
                ];
            }
            $dailyMap[$d]['sessionCount']++;
            if ($isCompleted) {
                $dailyMap[$d]['completedCount']++;
                $dailyMap[$d]['totalRecordedMinutes'] += $mins;
            }
            if ($row['missingClockOut']) {
                $dailyMap[$d]['missingClockOutCount']++;
            }
            if ($row['isOvernight']) {
                $dailyMap[$d]['overnightCount']++;
            }

            if ($row['department'] !== 'Unknown') {
                $dept = $row['department'];
                if (! isset($attDeptMap[$dept])) {
                    $attDeptMap[$dept] = [
                        'department' => $dept,
                        'sessionCount' => 0,
                        'completedCount' => 0,
                        'missingClockOutCount' => 0,
                        'overnightCount' => 0,
                        'totalRecordedMinutes' => 0,
                    ];
                }
                $attDeptMap[$dept]['sessionCount']++;
                if ($isCompleted) {
                    $attDeptMap[$dept]['completedCount']++;
                    $attDeptMap[$dept]['totalRecordedMinutes'] += $mins;
                }
                if ($row['missingClockOut']) {
                    $attDeptMap[$dept]['missingClockOutCount']++;
                }
                if ($row['isOvernight']) {
                    $attDeptMap[$dept]['overnightCount']++;
                }
            }

            $ek = strtoupper($row['employeeId']);
            if (! isset($attEmpMap[$ek])) {
                $attEmpMap[$ek] = [
                    'employeeId' => $row['employeeId'],
                    'employeeName' => $row['employeeName'],
                    'department' => $row['department'],
                    'sessionCount' => 0,
                    'completedCount' => 0,
                    'missingClockOutCount' => 0,
                    'overnightCount' => 0,
                    'totalRecordedMinutes' => 0,
                ];
            }
            $attEmpMap[$ek]['sessionCount']++;
            if ($isCompleted) {
                $attEmpMap[$ek]['completedCount']++;
                $attEmpMap[$ek]['totalRecordedMinutes'] += $mins;
            }
            if ($row['missingClockOut']) {
                $attEmpMap[$ek]['missingClockOutCount']++;
            }
            if ($row['isOvernight']) {
                $attEmpMap[$ek]['overnightCount']++;
            }
        }

        ksort($dailyMap);
        $attDeptList = array_values($attDeptMap);
        usort($attDeptList, fn (array $a, array $b): int => ($b['sessionCount'] <=> $a['sessionCount']) ?: strcmp($a['department'], $b['department']));
        $attEmpList = array_values($attEmpMap);
        usort($attEmpList, fn (array $a, array $b): int => ($b['sessionCount'] <=> $a['sessionCount']) ?: strcmp($a['employeeName'], $b['employeeName']));

        $approvedLeaveByCode = [];
        foreach ($scopedLeave as $req) {
            if ($req->status !== LeaveRequest::STATUS_APPROVED || ! $req->employee) {
                continue;
            }
            $approvedLeaveByCode[strtoupper($req->employee->employee_code)][] = $req;
        }

        $leaveOverlaps = [];
        foreach ($matchingAttendance as $attRow) {
            $ek = strtoupper($attRow['employeeId']);
            foreach ($approvedLeaveByCode[$ek] ?? [] as $approvedReq) {
                $ls = $approvedReq->start_date->format('Y-m-d');
                $le = $approvedReq->end_date->format('Y-m-d');
                if ($attRow['attendanceDate'] >= $ls && $attRow['attendanceDate'] <= $le) {
                    $leaveOverlaps[] = [
                        'employeeId' => $attRow['employeeId'],
                        'employeeName' => $attRow['employeeName'],
                        'department' => $approvedReq->employee->department,
                        'attendanceDate' => $attRow['attendanceDate'],
                        'attendanceRecordId' => $attRow['id'],
                        'leaveRequestId' => (string) $approvedReq->id,
                        'leaveType' => $approvedReq->leave_type,
                        'leaveStartDate' => $ls,
                        'leaveEndDate' => $le,
                    ];
                }
            }
        }

        // 3. Leave Analytics
        $effectiveStart = $filters['startDate'] ?? '0000-01-01';
        $effectiveEnd = $filters['endDate'] ?? '9999-12-31';
        $matchingLeaveRows = [];

        foreach ($scopedLeave as $req) {
            $owner = $req->employee;
            $ownerDept = $owner?->department ?? 'Operations';
            $reqStart = $req->start_date->format('Y-m-d');
            $reqEnd = $req->end_date->format('Y-m-d');

            if ($filters['department'] !== 'All' && $ownerDept !== $filters['department']) {
                continue;
            }
            if ($filters['employeeId'] !== 'All' && strtoupper($owner?->employee_code ?? '') !== $filters['employeeId']) {
                continue;
            }
            if ($filters['employmentStatus'] !== 'All' && $owner?->employment_status !== $filters['employmentStatus']) {
                continue;
            }
            if ($filters['leaveStatus'] !== 'All' && $req->status !== $filters['leaveStatus']) {
                continue;
            }
            if (! ($reqStart <= $effectiveEnd && $reqEnd >= $effectiveStart)) {
                continue;
            }

            $matchingLeaveRows[] = [
                'id' => (string) $req->id,
                'employeeId' => $owner?->employee_code ?? '',
                'employeeName' => $owner?->full_name ?? '',
                'department' => $ownerDept,
                'leaveType' => $req->leave_type,
                'startDate' => $reqStart,
                'endDate' => $reqEnd,
                'calendarDays' => (int) $req->total_days,
                'status' => $req->status,
                'submittedAtUtc' => $req->created_at?->toIso8601String() ?? '',
                'reviewedByRole' => $req->reviewedBy?->employee?->assigned_role,
                'reviewedAtUtc' => $req->reviewed_at_utc?->toIso8601String(),
            ];
        }

        $pendingReq = 0;
        $approvedReq = 0;
        $rejectedReq = 0;
        $cancelledReq = 0;
        $approvedCalendarDays = 0;
        $typeMap = [];
        $lvDeptMap = [];
        $monthMap = [];

        foreach ($matchingLeaveRows as $row) {
            match ($row['status']) {
                'Pending' => $pendingReq++,
                'Approved' => [$approvedReq++, $approvedCalendarDays += $row['calendarDays']],
                'Rejected' => $rejectedReq++,
                'Cancelled' => $cancelledReq++,
                default => null,
            };

            $lt = $row['leaveType'];
            if (! isset($typeMap[$lt])) {
                $typeMap[$lt] = [
                    'leaveType' => $lt,
                    'totalCount' => 0,
                    'pendingCount' => 0,
                    'approvedCount' => 0,
                    'rejectedCount' => 0,
                    'cancelledCount' => 0,
                    'approvedCalendarDays' => 0,
                ];
            }
            $typeMap[$lt]['totalCount']++;
            if ($row['status'] === 'Pending') {
                $typeMap[$lt]['pendingCount']++;
            }
            if ($row['status'] === 'Approved') {
                $typeMap[$lt]['approvedCount']++;
                $typeMap[$lt]['approvedCalendarDays'] += $row['calendarDays'];
            }
            if ($row['status'] === 'Rejected') {
                $typeMap[$lt]['rejectedCount']++;
            }
            if ($row['status'] === 'Cancelled') {
                $typeMap[$lt]['cancelledCount']++;
            }

            $ld = $row['department'];
            if (! isset($lvDeptMap[$ld])) {
                $lvDeptMap[$ld] = [
                    'department' => $ld,
                    'totalCount' => 0,
                    'pendingCount' => 0,
                    'approvedCount' => 0,
                    'rejectedCount' => 0,
                    'cancelledCount' => 0,
                    'approvedCalendarDays' => 0,
                ];
            }
            $lvDeptMap[$ld]['totalCount']++;
            if ($row['status'] === 'Pending') {
                $lvDeptMap[$ld]['pendingCount']++;
            }
            if ($row['status'] === 'Approved') {
                $lvDeptMap[$ld]['approvedCount']++;
                $lvDeptMap[$ld]['approvedCalendarDays'] += $row['calendarDays'];
            }
            if ($row['status'] === 'Rejected') {
                $lvDeptMap[$ld]['rejectedCount']++;
            }
            if ($row['status'] === 'Cancelled') {
                $lvDeptMap[$ld]['cancelledCount']++;
            }

            $mk = substr($row['startDate'], 0, 7);
            if (! isset($monthMap[$mk])) {
                $monthMap[$mk] = [
                    'month' => $mk,
                    'totalCount' => 0,
                    'pendingCount' => 0,
                    'approvedCount' => 0,
                    'rejectedCount' => 0,
                    'cancelledCount' => 0,
                ];
            }
            $monthMap[$mk]['totalCount']++;
            if ($row['status'] === 'Pending') {
                $monthMap[$mk]['pendingCount']++;
            }
            if ($row['status'] === 'Approved') {
                $monthMap[$mk]['approvedCount']++;
            }
            if ($row['status'] === 'Rejected') {
                $monthMap[$mk]['rejectedCount']++;
            }
            if ($row['status'] === 'Cancelled') {
                $monthMap[$mk]['cancelledCount']++;
            }
        }

        $byLeaveType = array_values($typeMap);
        usort($byLeaveType, fn (array $a, array $b): int => ($b['totalCount'] <=> $a['totalCount'])
            ?: (array_search($a['leaveType'], self::LEAVE_TYPES, true) <=> array_search($b['leaveType'], self::LEAVE_TYPES, true)));

        $lvDeptList = array_values($lvDeptMap);
        usort($lvDeptList, fn (array $a, array $b): int => ($b['totalCount'] <=> $a['totalCount']) ?: strcmp($a['department'], $b['department']));

        ksort($monthMap);

        return [
            'isDemoMode' => false,
            'businessTimezone' => 'Asia/Manila',
            'generatedAtUtc' => now('UTC')->toIso8601String(),
            'authorizedScope' => $scope,
            'canExport' => $user->hasPermission('reports.export'),
            'filters' => $filters,
            'availableDepartments' => $availableDepartments,
            'availableEmployees' => $availableEmployees,
            'policyFlags' => [
                'attendanceAbsencePolicyConfigured' => false,
                'attendanceLatePolicyConfigured' => false,
                'recordedDurationEqualsPayableHours' => false,
                'leaveBalanceTrackingSupported' => false,
            ],
            'employeeAnalytics' => [
                'totalEmployees' => count($employeeRows),
                'activeEmployees' => $activeCount,
                'probationEmployees' => $probationCount,
                'onLeaveStatusEmployees' => $onLeaveCount,
                'inactiveEmployees' => $inactiveCount,
                'newHiresInPeriod' => $newHiresInPeriod,
                'byDepartment' => array_values($empDeptMap),
                'byEmploymentStatus' => $byEmploymentStatus,
                'employees' => $employeeRows,
            ],
            'attendanceAnalytics' => [
                'totalSessions' => count($matchingAttendance),
                'completedSessions' => $completedSessions,
                'missingClockOutCount' => $missingClockOutCount,
                'overnightSessionsCount' => $overnightSessionsCount,
                'totalRecordedMinutes' => $totalRecordedMinutes,
                'averageRecordedMinutes' => $completedSessions > 0 ? (int) round($totalRecordedMinutes / $completedSessions) : null,
                'dailyTrends' => array_values($dailyMap),
                'byDepartment' => $attDeptList,
                'byEmployee' => $attEmpList,
                'records' => $matchingAttendance,
                'leaveOverlaps' => $leaveOverlaps,
            ],
            'leaveAnalytics' => [
                'totalRequests' => count($matchingLeaveRows),
                'pendingRequests' => $pendingReq,
                'approvedRequests' => $approvedReq,
                'rejectedRequests' => $rejectedReq,
                'cancelledRequests' => $cancelledReq,
                'approvedCalendarDays' => $approvedCalendarDays,
                'byLeaveType' => $byLeaveType,
                'byDepartment' => $lvDeptList,
                'monthlyTrends' => array_values($monthMap),
                'requests' => $matchingLeaveRows,
            ],
            'metricDefinitions' => self::METRIC_DEFINITIONS,
        ];
    }

    private function isValidDate(string $value): bool
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }
        $dt = CarbonImmutable::createFromFormat('!Y-m-d', $value);

        return $dt !== false && $dt->format('Y-m-d') === $value;
    }

    private function sanitizeCsvCell(string|int|bool|null $value): string
    {
        if ($value === null) {
            return '';
        }
        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }
        if (is_int($value)) {
            return (string) $value;
        }

        $safe = $value;
        if (preg_match('/^[\t\r ]*[=+\-@]|^[\t\r]/', $safe) === 1) {
            $safe = "'".$safe;
        }

        if (preg_match('/[",\n\r]/', $safe) === 1 || str_starts_with($safe, "'")) {
            return '"'.str_replace('"', '""', $safe).'"';
        }

        return $safe;
    }

    /**
     * @param  list<string>  $headers
     * @param  list<list<string|int|bool|null>>  $rows
     */
    private function buildCsvDocument(array $headers, array $rows): string
    {
        $lines = [implode(',', array_map(fn (string $h): string => $this->sanitizeCsvCell($h), $headers))];
        foreach ($rows as $row) {
            $lines[] = implode(',', array_map(fn ($cell): string => $this->sanitizeCsvCell($cell), $row));
        }

        return implode("\n", $lines);
    }

    /**
     * @param  list<array<string, mixed>>  $employees
     */
    private function buildEmployeeCsv(array $employees): string
    {
        $headers = ['Employee ID', 'Full Name', 'Department', 'Position', 'Employment Status', 'Hire Date'];
        $rows = array_map(fn (array $e): array => [
            $e['employeeId'],
            $e['fullName'],
            $e['department'],
            $e['position'],
            $e['employmentStatus'],
            $e['hireDate'],
        ], $employees);

        return $this->buildCsvDocument($headers, $rows);
    }

    /**
     * @param  list<array<string, mixed>>  $records
     */
    private function buildAttendanceCsv(array $records): string
    {
        $headers = [
            'Employee ID',
            'Employee Name',
            'Department',
            'Attendance Date (Asia/Manila)',
            'Clock-In (Asia/Manila)',
            'Clock-Out (Asia/Manila)',
            'Recorded Duration (Minutes)',
            'Status',
            'Overnight Shift',
            'Missing Clock-Out',
        ];
        $rows = array_map(fn (array $r): array => [
            $r['employeeId'],
            $r['employeeName'],
            $r['department'],
            $r['attendanceDate'],
            CarbonImmutable::parse($r['clockInAtUtc'])->setTimezone('Asia/Manila')->format('Y-m-d H:i:s'),
            $r['clockOutAtUtc'] ? CarbonImmutable::parse($r['clockOutAtUtc'])->setTimezone('Asia/Manila')->format('Y-m-d H:i:s') : '',
            $r['durationMinutes'],
            $r['status'],
            (bool) $r['isOvernight'],
            (bool) $r['missingClockOut'],
        ], $records);

        return $this->buildCsvDocument($headers, $rows);
    }

    /**
     * @param  list<array<string, mixed>>  $requests
     */
    private function buildLeaveCsv(array $requests): string
    {
        $headers = [
            'Request ID',
            'Employee ID',
            'Employee Name',
            'Department',
            'Leave Type',
            'Start Date',
            'End Date',
            'Calendar Days',
            'Status',
            'Submitted (Asia/Manila)',
            'Reviewed By Role',
        ];
        $rows = array_map(fn (array $r): array => [
            $r['id'],
            $r['employeeId'],
            $r['employeeName'],
            $r['department'],
            $r['leaveType'],
            $r['startDate'],
            $r['endDate'],
            $r['calendarDays'],
            $r['status'],
            $r['submittedAtUtc'] !== '' ? CarbonImmutable::parse($r['submittedAtUtc'])->setTimezone('Asia/Manila')->format('Y-m-d H:i:s') : '',
            $r['reviewedByRole'] ?? '',
        ], $requests);

        return $this->buildCsvDocument($headers, $rows);
    }
}
