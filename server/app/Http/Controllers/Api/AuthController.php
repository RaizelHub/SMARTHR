<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Transformers\PayrollPresenter;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();
        $user = User::query()
            ->with('employee')
            ->where('email', strtolower(trim((string) $credentials['email'])))
            ->first();

        if (! $user || ! Hash::check((string) $credentials['password'], $user->password)) {
            return response()->json([
                'code' => 'INVALID_CREDENTIALS',
                'message' => 'Invalid email or password.',
            ], 401);
        }

        if (! $user->isActiveAccount()) {
            return response()->json([
                'code' => 'EMPLOYEE_INACTIVE',
                'message' => 'Inactive employee accounts cannot authenticate.',
            ], 403);
        }

        $expirationMinutes = (int) config('sanctum.expiration', 480);
        $expiresAt = now('UTC')->addMinutes($expirationMinutes);
        $token = $user->createToken('smarthr-spa', ['*'], $expiresAt);

        return response()->json([
            'token' => $token->plainTextToken,
            'tokenType' => 'Bearer',
            'expiresAtUtc' => $expiresAt->toIso8601String(),
            'user' => PayrollPresenter::userSession($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->load('employee');

        if (! $user->isActiveAccount()) {
            return response()->json([
                'code' => 'EMPLOYEE_INACTIVE',
                'message' => 'Your employee account is inactive.',
            ], 403);
        }

        return response()->json([
            'user' => PayrollPresenter::userSession($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();
        if ($token !== null) {
            $token->delete();
        }

        return response()->json([
            'message' => 'Signed out cleanly.',
        ]);
    }
}

