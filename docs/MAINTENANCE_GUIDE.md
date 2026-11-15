# Smart HR — System Maintenance & Software Update Guide

This guide establishes the standard operating procedures for performing software updates, database migrations, security patching, routine database maintenance, and disaster rollbacks across managed Smart HR instances.

---

## 1. Maintenance Principles & Schedule Planning

1. **Avoid Payroll Cut-off Windows**:
   - In the Philippines, semi-monthly payroll cycles typically run between the **10th–15th** and **25th–end-of-month**.
   - Routine scheduled maintenance must strictly avoid these cut-off windows.
   - Recommended Maintenance Window: **Saturdays between 22:00 and 02:00 Asia/Manila**.
2. **Customer Isolation**:
   - Because Smart HR utilizes a single-tenant architecture, maintenance and updates are rolled out in canary stages (e.g. internal staging instance first, then pilot client, then general production instances).
3. **Mandatory Pre-Update Backup**:
   - No update or migration may be executed without an automated, verified pre-deployment database snapshot.

---

## 2. Standard Software Update Procedure

Follow this exact 8-step sequence for updating a client instance:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Software Update Pipeline                        │
│                                                                        │
│   [1. Pre-Check] ───> [2. DB Snapshot] ───> [3. Maintenance Mode]     │
│                              │                                         │
│                              ▼                                         │
│   [6. Health Check] <─── [5. Cache Warm] <─── [4. Deploy Code & DDL]   │
│           │                                                            │
│           ▼                                                            │
│   [7. Live Verification] ─> [8. Exit Maint Mode]                       │
└────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Pre-Update Health Verification
```bash
# Verify system is healthy before initiating changes
curl -fsS https://api.customerdomain.com/api/health
```

### Step 2: Create Pre-Deployment Database Snapshot
```bash
BACKUP_NAME="pre_update_$(date -u +%Y%m%dT%H%M%SZ)"
sudo -u postgres pg_dump --format=custom --no-owner smarthr_production \
  | gzip > "/var/backups/smarthr/${BACKUP_NAME}.dump.gz"

# Verify backup archive integrity
gunzip -t "/var/backups/smarthr/${BACKUP_NAME}.dump.gz"
```

### Step 3: Put Application in Maintenance Mode
```bash
cd /var/www/smarthr/server
php artisan down --secret="smarthr-admin-bypass-key" \
  --render="errors::503" \
  --retry=60
```

### Step 4: Deploy Code, Dependencies & Database Migrations
```bash
# Pull tested release tag
cd /var/www/smarthr
git fetch --tags
git checkout tags/v1.1.0

# Update backend dependencies
cd /var/www/smarthr/server
composer install --no-dev --optimize-autoloader --no-interaction

# Execute database migrations
php artisan migrate --force

# Seed updated statutory rule versions if included in release
php artisan db:seed --class=StatutoryRuleSeeder --force

# Build or deploy compiled frontend assets
cd /var/www/smarthr/client
npm ci
npm run build
```

### Step 5: Warm Application Caches
```bash
cd /var/www/smarthr/server
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### Step 6: Verify Health via Bypass
```bash
# Verify health endpoint using maintenance bypass cookie
curl -fsS https://api.customerdomain.com/api/health
```

### Step 7: Disable Maintenance Mode
```bash
cd /var/www/smarthr/server
php artisan up
```

### Step 8: Post-Deployment Smoke Test
Sign in as the HR Administrator and verify:
- Dashboard loads without console errors.
- Employee directory renders properly.
- Current attendance status is accurate.
- Latest payroll period is accessible.

---

## 3. Emergency Rollback Runbook

If a critical defect or migration failure is detected post-deployment, execute the immediate rollback procedure:

```bash
# 1. Re-enable maintenance mode immediately
cd /var/www/smarthr/server
php artisan down

# 2. Terminate active database connections to allow restoration
sudo -u postgres psql -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = 'smarthr_production' AND pid <> pg_backend_pid();
"

# 3. Restore pre-update database snapshot
gunzip -c "/var/backups/smarthr/${BACKUP_NAME}.dump.gz" \
  | sudo -u postgres pg_restore --clean --if-exists --no-owner --dbname=smarthr_production

# 4. Revert code to previous release tag
cd /var/www/smarthr
git checkout tags/v1.0.0

# 5. Reinstall previous dependencies and rebuild assets
cd /var/www/smarthr/server
composer install --no-dev --optimize-autoloader
php artisan config:cache
php artisan route:cache

cd /var/www/smarthr/client
npm ci
npm run build

# 6. Bring application back online
cd /var/www/smarthr/server
php artisan up

# 7. Document incident and notify stakeholders
```

---

## 4. Routine Database Maintenance (PostgreSQL)

Schedule routine PostgreSQL maintenance via `crontab` to maintain query performance:

```bash
# Edit PostgreSQL user crontab
sudo crontab -u postgres -e

# Run VACUUM ANALYZE every Sunday at 03:00 Asia/Manila
0 19 * * 0 /usr/bin/vacuumdb --all --analyze-in-stages --quiet

# Archive older security audit logs (retain 12 months hot storage)
0 2 1 * * /usr/bin/psql -d smarthr_production -c "DELETE FROM security_audit_logs WHERE occurred_at_utc < NOW() - INTERVAL '1 year';"
```

---

## 5. Security Patching & Dependency Management

1. **Vulnerability Audits**:
   - Run weekly dependency scans:
     ```bash
     cd server && composer audit
     cd ../client && npm audit
     ```
2. **OS Security Updates**:
   - Apply Ubuntu/Debian security patches using `unattended-upgrades` for standard kernel and OpenSSL patches:
     ```bash
     sudo apt update && sudo apt --only-upgrade install -y openssl libssl3 nginx
     ```
3. **Preservation of Customer Configuration**:
   - Customer-specific configuration resides exclusively in `server/.env` and `client/.env.production`.
   - These files are strictly excluded from version control (`.gitignore`), ensuring that `git checkout` or `git pull` will never overwrite customer secrets, database credentials, or custom corporate identifiers.

