<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    public function show(): JsonResponse
    {
        try {
            DB::select('select 1');

            return response()->json([
                'status' => 'ok',
                'database' => 'connected',
                'timezone' => 'Asia/Manila',
                'timestampUtc' => now('UTC')->toIso8601String(),
            ]);
        } catch (Throwable) {
            return response()->json([
                'status' => 'degraded',
                'database' => 'disconnected',
                'timezone' => 'Asia/Manila',
                'timestampUtc' => now('UTC')->toIso8601String(),
            ], 503);
        }
    }
}
