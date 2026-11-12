<?php

namespace App\Models;

use App\Support\RolePermissions;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class, 'user_id');
    }

    public function isActiveAccount(): bool
    {
        $employee = $this->employee;
        if (! $employee) {
            return false;
        }

        return $employee->employment_status !== 'Inactive';
    }

    public function hasPermission(string $permission): bool
    {
        $employee = $this->employee;
        if (! $employee || $employee->employment_status === 'Inactive') {
            return false;
        }

        return RolePermissions::hasPermission($employee->assigned_role, $permission);
    }
}
