<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_statutory_rule_versions', function (Blueprint $table): void {
            $table->id();
            $table->string('rule_key', 64)->unique();
            $table->string('agency', 32); // SSS | PhilHealth | Pag-IBIG | BIR
            $table->string('issuance_reference', 120);
            $table->string('official_url', 255);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->json('parameters_json');
            $table->timestamps();

            $table->index(['agency', 'effective_from', 'is_active'], 'stat_rule_effective_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_statutory_rule_versions');
    }
};
