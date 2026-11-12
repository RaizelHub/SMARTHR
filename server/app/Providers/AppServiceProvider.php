<?php

namespace App\Providers;

use App\Models\EmployeeCompensation;
use App\Models\PayrollEntry;
use App\Models\PayrollPeriod;
use App\Policies\EmployeeCompensationPolicy;
use App\Policies\PayrollEntryPolicy;
use App\Policies\PayrollPeriodPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Gate::policy(EmployeeCompensation::class, EmployeeCompensationPolicy::class);
        Gate::policy(PayrollPeriod::class, PayrollPeriodPolicy::class);
        Gate::policy(PayrollEntry::class, PayrollEntryPolicy::class);

        RateLimiter::for('auth-login', function (Request $request): Limit {
            $email = strtolower(trim((string) $request->input('email', '')));

            return Limit::perMinute(10)->by($request->ip().'|'.$email);
        });

        RateLimiter::for('payroll-sensitive', function (Request $request): Limit {
            return Limit::perMinute(120)->by(
                (string) ($request->user()?->id ?? $request->ip()),
            );
        });
    }
}
