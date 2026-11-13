# Smart HR — Deployment, PostgreSQL, Security & Recovery Runbook

## 1. Environment & Runtime Prerequisites
- **PHP**: `8.4+` with extensions enabled: `pdo_pgsql`, `pgsql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `json`, `bcmath`, `fileinfo`, `intl`, `dom`, `gd` (for DomPDF payslip PDF rendering).
- **Database**: PostgreSQL `15+` or `16+` in production (verified PostgreSQL-compatible migrations and types; SQLite used only for local standalone development and isolated PHPUnit test verification when PostgreSQL server binaries are absent).
- **Node.js (Frontend Build)**: `20+` LTS for Vite TypeScript production bundle (`client/dist/`).
- **Business Timezone**: All attendance shift attribution dates (`attendance_date`), leave request ranges, payroll cutoffs, and CSV/audit displays normalize against `Asia/Manila` while storing authoritative event instants in UTC (`_utc` columns).

---

## 2. Production Configuration Checklist

### Backend (`server/.env`)
```env
APP_NAME="Smart HR"
APP_ENV=production
APP_DEBUG=false
APP_KEY=<generated via php artisan key:generate>
APP_URL=https://api.smarthr.example.com

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=smarthr_prod
DB_USERNAME=smarthr_app
DB_PASSWORD=<strong secret from vault/env manager>

SESSION_DRIVER=database
CACHE_STORE=database
QUEUE_CONNECTION=database

SANCTUM_STATEFUL_DOMAINS=hr.smarthr.example.com
SANCTUM_EXPIRATION=480
FRONTEND_URL=https://hr.smarthr.example.com
CORS_ALLOWED_ORIGINS=https://hr.smarthr.example.com
```

### Frontend (`client/.env.production`)
```env
VITE_API_BASE_URL=https://api.smarthr.example.com/api
```

### Least-Privilege Database Role (PostgreSQL)
Never connect the web application as `postgres` superuser. Provision a scoped role:
```sql
CREATE ROLE smarthr_app WITH LOGIN PASSWORD '<vault-secret>';
CREATE DATABASE smarthr_prod OWNER smarthr_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO smarthr_app;
```

### Transport, CORS & Auth Security Controls
- Enforce TLS 1.2+ / HTTPS at the reverse proxy (Nginx / Caddy / ALB) with HSTS and `X-Forwarded-Proto` trust configured cleanly.
- Restrict `CORS_ALLOWED_ORIGINS` strictly to the deployed frontend origin (wildcard `*` forbidden when Bearer/Sanctum auth or cookies are present).
- Keep `APP_DEBUG=false` in production so stack traces and environment variables are never serialized in JSON errors.
- Bearer tokens expire per `SANCTUM_EXPIRATION` (default 480 minutes / 8 hours). Setting `employment_status = 'Inactive'` immediately deletes all Sanctum tokens for the employee (`EmployeeController::update`) and `EnsureActiveEmployee` middleware rejects & revokes any residual active tokens (`403 EMPLOYEE_INACTIVE`).
- Historical HR, attendance, leave, compensation, and payroll foreign keys use `ON DELETE RESTRICT` (`restrictOnDelete()`), preventing silent cascading deletion of audit/payroll history.

---

## 3. Initial Deployment & Health Verification
1. Install backend dependencies without dev packages:
   ```bash
   cd server
   composer install --no-dev --optimize-autoloader
   php artisan config:cache
   php artisan route:cache
   php artisan view:cache
   php artisan migrate --force
   php artisan db:seed --class=StatutoryRuleSeeder --force
   ```
   *(Never run `DevPayrollUserSeeder` or set `DEMO_SEED_PASSWORD` in production.)*
2. Build static frontend assets:
   ```bash
   cd client
   npm ci
   npm run build
   ```
3. Verify readiness probe (returns `200 OK`, confirms database ping without exposing secrets):
   ```bash
   curl -fsS https://api.smarthr.example.com/api/health
   # Expected: {"status":"ok","database":"connected","timezone":"Asia/Manila","timestampUtc":"..."}
   ```

---

## 4. Backup, Encryption & Recovery Strategy

### PostgreSQL Daily Backup Policy
- **Frequency**: Automated `pg_dump` custom-format logical snapshot daily at `02:00 Asia/Manila`, paired with continuous WAL archiving (`archive_mode = on`) for point-in-time recovery (PITR).
- **Retention**: 30 daily backups, 12 monthly end-of-month archives, and immutable statutory payroll run snapshots aligned with Philippine DOLE/BIR retention policies.
- **Encryption**: Encrypt dump artifacts before off-host object storage upload (`age` or KMS-managed AES-256) and restrict backup bucket IAM roles to write-only from backup workers.

### Example Logical Backup Command (PostgreSQL)
```bash
pg_dump --format=custom --no-owner --no-privileges \
  --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USERNAME" "$DB_DATABASE" \
  | gzip > "smarthr_$(date -u +%Y%m%dT%H%M%SZ).dump.gz"
```

### Safe Restore Verification Procedure (Non-Destructive)
Never overwrite the active production database to test a backup. Restore into an isolated temporary schema/database first:
```bash
createdb --host="$DB_HOST" --username="$DB_USERNAME" smarthr_restore_verify
gunzip -c smarthr_YYYYMMDDTHHMMSSZ.dump.gz | pg_restore --no-owner --no-privileges --dbname=smarthr_restore_verify
psql --dbname=smarthr_restore_verify -c "SELECT COUNT(*) FROM employees; SELECT COUNT(*) FROM payroll_periods; SELECT COUNT(*) FROM payroll_entries;"
dropdb smarthr_restore_verify
```

---

## 5. Verified Environment Limitations & Unconfigured Policies
- **Local Windows Host Notice**: This development workstation does not have `psql`, `pg_dump`, or a running PostgreSQL service installed (`pdo_pgsql` driver is loaded in PHP 8.4, while local runtime verification used isolated SQLite databases). PostgreSQL DDL/dump/restore execution must be run against a live PostgreSQL instance during staging provisioning.
- **Unconfigured HR Rules**: Company shift schedules (absences/tardiness), automated overtime multipliers, leave balance entitlements/accruals, and bank payment file generation remain outside current scope and are explicitly flagged in reports and payslips (`recordedDurationEqualsPayableHours: false`, `leaveBalanceTrackingSupported: false`).

