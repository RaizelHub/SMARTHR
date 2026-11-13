<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveEmployee
{
    /**
     * Rejects requests whose authenticated Sanctum user has no active employee profile.
     * Any existing Bearer tokens for deactivated accounts are revoked immediately.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'code' => 'UNAUTHENTICATED',
                'message' => 'Authentication is required.',
            ], 401);
        }

        $user->loadMissing('employee');

        if (! $user->isActiveAccount()) {
            $token = $user->currentAccessToken();
            if ($token !== null && method_exists($token, 'delete')) {
                $token->delete();
            }

            return response()->json([
                'code' => 'EMPLOYEE_INACTIVE',
                'message' => 'Inactive employee accounts cannot access Smart HR.',
            ], 403);
        }

        return $next($request);
    }
}
