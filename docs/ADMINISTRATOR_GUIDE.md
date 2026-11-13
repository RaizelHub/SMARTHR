# Smart HR — System Administrator Guide

This guide is intended for DevOps engineers, database administrators, and IT/HR system administrators responsible for deploying, configuring, securing, and maintaining the Smart HR platform.

---

## 1. System Architecture & Requirements

Smart HR is built on a decoupled full-stack architecture:

- **Frontend**: Single Page Application built with React 19, TypeScript, Tailwind CSS, and Vite. Static assets compile to standard HTML, CSS, and JS (`client/dist/`) and can be hosted behind any reverse proxy or CDN (e.g., Nginx, Caddy, Cloudflare).
- **Backend API**: REST API built on Laravel 12 running on PHP 8.4+ with Laravel Sanctum Bearer token authentication.
- **Production Database**: PostgreSQL 15+ or 16+ with UTF-8 encoding.
- **Local Development / Test Database**: SQLite (using `:memory:` for automated test isolation and `database.sqlite` for local dev).
- **Required PHP Extensions**: `pdo_pgsql`, `pgsql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `json`, `bcmath`, `fileinfo`, `intl`, `dom`, `gd`.

---

## 2. Environment Configuration

### 2.1 Backend Configuration (`server/.env`)

```ini
APP_NAME="Smart HR"
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:<generated-via-php-artisan-key:generate>
APP_URL=https://api.smarthr.yourdomain.com
APP_TIMEZONE=UTC

LOG_CHANNEL=stack
LOG_LEVEL=info

# PostgreSQL Production Database Configuration
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=smarthr_production
DB_USERNAME=smarthr_app
DB_PASSWORD=<vault-stored-database-password>

# Session, Cache & Queue Drivers
SESSION_DRIVER=database
SESSION_LIFETIME=120
CACHE_STORE=database
QUEUE_CONNECTION=database

# Authentication & CORS Security
SANCTUM_STATEFUL_DOMAINS=hr.smarthr.yourdomain.com
SANCTUM_EXPIRATION=480
FRONTEND_URL=https://hr.smarthr.yourdomain.com
CORS_ALLOWED_ORIGINS=https://hr.smarthr.yourdomain.com

# Seeder Password (STRICTLY FOR TEST/STAGING ONLY; MUST BE EMPTY IN PRODUCTION)
DEMO_SEED_PASSWORD=
```

### 2.2 Frontend Configuration (`client/.env.production`)

```ini
# Points to the public HTTPS URL of the Laravel API
VITE_API_BASE_URL=https://api.smarthr.yourdomain.com/api
```

---

## 3. Database Provisioning & Least-Privilege Role (PostgreSQL)

Never connect the application using the `postgres` superuser account. Provision a dedicated application role:

```sql
-- 1. Create dedicated user and database
CREATE ROLE smarthr_app WITH LOGIN PASSWORD '<vault-stored-database-password>';
CREATE DATABASE smarthr_production OWNER smarthr_app;

-- 2. Restrict schema permissions
\connect smarthr_production
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO smarthr_app;
```

### Running Migrations & Canonical Seeders

```bash
cd /var/www/smarthr/server

# Run database migrations
php artisan migrate --force

# Seed statutory calculation rule versions (SSS, PhilHealth, Pag-IBIG, BIR)
php artisan db:seed --class=StatutoryRuleSeeder --force
```

> [!CAUTION]
> **Production Guard**: `StatutoryRuleSeeder` is safe to run in production. `DevPayrollUserSeeder` contains synthetic employee accounts and **strictly aborts** if `APP_ENV=production` or if `DEMO_SEED_PASSWORD` is unset.

---

## 4. Role Permissions & User Administration

### 4.1 Permission Matrix Reference

| Permission Key | Description | HR Admin | HR Coord | Manager | Employee |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `employees.read_own` | View personal employee record | Yes | Yes | Yes | Yes |
| `employees.read_team` | View department employee records | Yes | Yes | Yes | No |
| `employees.read_all` | View organization directory | Yes | Yes | No | No |
| `employees.create` | Register new employee records | Yes | Yes | No | No |
| `employees.update` | Edit employee details & status | Yes | Yes | No | No |
| `employees.delete` | Clear demo directory (demo mode only) | Yes | No | No | No |
| `roles.manage` | Update employee role assignments & view security logs | Yes | No | No | No |
| `attendance.record_own` | Clock in and out for personal shift | Yes | Yes | Yes | Yes |
| `attendance.read_own` | View personal attendance log | Yes | Yes | Yes | Yes |
| `attendance.read_team` | View department attendance log | Yes | Yes | Yes | No |
| `attendance.read_all` | View organization-wide attendance | Yes | Yes | No | No |
| `leave.request` | Submit personal leave requests | Yes | Yes | Yes | Yes |
| `leave.read_own` | View personal leave requests | Yes | Yes | Yes | Yes |
| `leave.read_team` | View department leave requests | Yes | Yes | Yes | No |
| `leave.read_all` | View organization-wide leave requests | Yes | Yes | No | No |
| `leave.approve` | Approve leave requests within scope | Yes | Yes | Yes | No |
| `leave.reject` | Reject leave requests within scope | Yes | Yes | Yes | No |
| `reports.view_own` | View personal report summary | Yes | Yes | Yes | Yes |
| `reports.view_team` | View department analytics & export CSV | Yes | Yes | Yes | No |
| `reports.view_all` | View company analytics & export CSV | Yes | Yes | No | No |
| `compensation.manage` | Configure base pay & allowances | Yes | No | No | No |
| `payroll.create` | Create payroll periods | Yes | Yes | No | No |
| `payroll.calculate` | Run draft calculations | Yes | Yes | No | No |
| `payroll.review` | Submit periods for review | Yes | Yes | No | No |
| `payroll.approve` | Formally approve payroll runs | Yes | No | No | No |
| `payroll.lock` | Lock completed payroll runs | Yes | No | No | No |
| `payroll.view` | View organization payroll records | Yes | Yes | No | No |
| `payroll.view_own` | View personal payslips | Yes | Yes | Yes | Yes |

### 4.2 Security Protections Enforced by Backend

1. **Active Account Middleware (`EnsureActiveEmployee`)**:
   - Every authenticated API request verifies that the acting user's employee record has `employment_status != 'Inactive'`.
   - Inactive accounts immediately receive `HTTP 403 (EMPLOYEE_INACTIVE)`, and their active Sanctum Bearer tokens are deleted from the database.
2. **Last Administrator Protection**:
   - `EmployeeController::updateRole` and `EmployeeController::update` block any attempt to demote or deactivate the organization's sole remaining `HR Admin` with `HTTP 409 (LAST_ADMIN_PROTECTED)`.
3. **Historical Record Preservation**:
   - Foreign key constraints on `employee_compensations`, `payroll_entries`, `attendances`, and `leave_requests` specify `ON DELETE RESTRICT`.
   - `DELETE /api/employees/{identifier}` strictly blocks deleting an employee if any historical attendance, leave, compensation, or payroll records exist (`HTTP 409 HISTORICAL_RECORDS_PROTECTED`).
4. **Self-Approval Prevention**:
   - `LeaveController::review` blocks reviewers from approving or rejecting their own leave requests with `HTTP 403 (CANNOT_APPROVE_OWN_LEAVE)`.

---

## 5. Backup, Restoration & Disaster Recovery

### 5.1 Automated Daily Logical Backups

Run daily logical backups using PostgreSQL's `pg_dump` with custom compressed format:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/smarthr"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
BACKUP_FILE="${BACKUP_DIR}/smarthr_prod_${TIMESTAMP}.dump.gz"

mkdir -p "$BACKUP_DIR"

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USERNAME" \
  "$DB_DATABASE" \
  | gzip > "$BACKUP_FILE"

# Upload to off-site KMS-encrypted bucket
aws s3 cp "$BACKUP_FILE" "s3://smarthr-production-backups/${TIMESTAMP}/" --sse aws:kms

# Retention: Delete local backups older than 14 days
find "$BACKUP_DIR" -name "*.dump.gz" -mtime +14 -delete
```

### 5.2 Non-Destructive Restore Verification Procedure

To verify backup integrity without impacting live operations, restore into a disposable temporary database:

```bash
# 1. Create verification database
createdb --host="$DB_HOST" --username="$DB_USERNAME" smarthr_verify_restore

# 2. Restore snapshot
gunzip -c smarthr_prod_YYYYMMDDTHHMMSSZ.dump.gz | pg_restore \
  --host="$DB_HOST" \
  --username="$DB_USERNAME" \
  --no-owner \
  --no-privileges \
  --dbname=smarthr_verify_restore

# 3. Query sample record counts
psql --host="$DB_HOST" --username="$DB_USERNAME" --dbname=smarthr_verify_restore -c "
  SELECT 'employees' AS tbl, count(*) FROM employees
  UNION ALL
  SELECT 'attendances', count(*) FROM attendances
  UNION ALL
  SELECT 'leave_requests', count(*) FROM leave_requests
  UNION ALL
  SELECT 'payroll_periods', count(*) FROM payroll_periods
  UNION ALL
  SELECT 'payroll_entries', count(*) FROM payroll_entries;
"

# 4. Tear down verification database
dropdb --host="$DB_HOST" --username="$DB_USERNAME" smarthr_verify_restore
```

---

## 6. Health Monitoring & Troubleshooting

### 6.1 Readiness Probe Endpoint

Smart HR provides an unauthenticated readiness probe at `GET /api/health`:

```bash
curl -fsS https://api.smarthr.yourdomain.com/api/health
```

**Expected Response (`HTTP 200 OK`)**:
```json
{
  "status": "ok",
  "database": "connected",
  "timezone": "Asia/Manila",
  "timestampUtc": "2026-11-14T03:00:00.000000Z"
}
```

The health check validates database connectivity and PHP timezone settings without exposing environment variables or secrets.

### 6.2 Common Operational Issues & Remediation

| Symptom | Probable Cause | Remediation |
| :--- | :--- | :--- |
| `HTTP 401 UNAUTHENTICATED` on API calls | Stale or expired Bearer token; `SANCTUM_EXPIRATION` reached | Log in again at `/`. Client automatically clears stored token on 401. |
| `HTTP 403 EMPLOYEE_INACTIVE` | Employee record marked `Inactive` | Reactivate account via an HR Admin or verify employment status. |
| `HTTP 409 HISTORICAL_RECORDS_PROTECTED` | Attempted hard deletion of employee with existing audit history | Smart HR preserves historical records. Update status to `Inactive` instead of deleting. |
| Payslip PDF generation fails (`500`) | Missing PHP GD or Dom extension | Ensure `php8.4-gd` and `php8.4-xml` extensions are installed on the server. |
| CORS Error in Browser Console | Mismatch between `CORS_ALLOWED_ORIGINS` and web client URL | Update `CORS_ALLOWED_ORIGINS` in `server/.env` to match the exact frontend URL scheme and host. |

