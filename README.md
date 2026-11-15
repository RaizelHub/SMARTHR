# Smart HR — Enterprise Human Resources Management System

[![Tests Backend](https://img.shields.io/badge/PHPUnit-17%20Passed-brightgreen)](server/)
[![Tests Frontend](https://img.shields.io/badge/Vitest-91%20Passed-brightgreen)](client/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](client/)
[![PHP](https://img.shields.io/badge/PHP-8.4%2B-blue)](server/)
[![Laravel](https://img.shields.io/badge/Laravel-12-red)](server/)
[![React](https://img.shields.io/badge/React-19-cyan)](client/)

Smart HR is a full-stack, enterprise-grade human resources management application designed for modern workforce administration, attendance tracking, leave requests, reporting, and Philippine statutory payroll compliance.

---

## 1. Core Capabilities & Implemented Modules

Smart HR provides an integrated suite of business modules:

- **Employee Management**: Roster viewing with role-based scoping, employee registration with duplicate validation, and inline employment status management (`Active`, `Probation`, `On Leave`, `Inactive`).
- **Attendance Management**: Single-click clock-in and clock-out, duplicate submission locks, duration tracking in minutes, and overnight shift handling, all evaluated against the **`Asia/Manila` (`UTC+08:00`)** business timezone.
- **Leave Management**: Leave requests (`Vacation`, `Sick`, `Maternity`, `Paternity`, `Bereavement`, `Unpaid`) with date-order checks, overlap prevention, self-service cancellation, and manager review queue with self-approval safeguards.
- **Role-Based Access Control (RBAC)**: 4 standardized roles (`HR Admin`, `HR Coordinator`, `Manager`, `Employee`) enforced both on client routes and authoritatively on backend API endpoints.
- **Workforce Analytics & Reports**: Real-time KPI summaries, department-scoped statistics, inclusive date range filtering, and CSV export with formula injection protection.
- **Philippine Statutory Payroll Compliance**:
  - Employee compensation setup (Monthly, Daily, Hourly) with non-taxable de minimis allowance separation.
  - SSS contribution calculation per SSS Circular No. 2024-006 (15% total: 5% employee, 10% employer) with mandatory WISP and EC separation.
  - PhilHealth contribution calculation per PhilHealth Circular No. 2020-0005 (5.0% rate, 50/50 split, floor PHP 10,000, ceiling PHP 100,000).
  - Pag-IBIG Fund deduction per Circular No. 460 (2% employee up to statutory cap, 2% employer).
  - BIR withholding tax table calculation under the TRAIN Law (Republic Act No. 10963).
  - Five-stage payroll approval workflow (`Draft` -> `Calculated` -> `In Review` -> `Approved` -> `Locked`) with optimistic concurrency locks.
  - Official A4 payslip modal with print formatting and downloadable PDF generation.
- **Security & Integrity Protections**:
  - `EnsureActiveEmployee` middleware: Deactivated accounts (`Inactive`) immediately lose active API Bearer tokens (`HTTP 403 EMPLOYEE_INACTIVE`).
  - Historical Record Preservation: `ON DELETE RESTRICT` foreign keys and backend deletion guards (`HTTP 409 HISTORICAL_RECORDS_PROTECTED`) prevent accidental loss of audit or payroll records.
  - Last Administrator Safeguard: Protects against demoting or deactivating the last remaining active HR Admin.
  - CSV injection protection against spreadsheet formulas.

---

## 2. Technology Stack

### Frontend (`client/`)
- **Framework**: React 19 with TypeScript
- **Styling**: Tailwind CSS v4 (clean enterprise aesthetic; no gradients or unnecessary animations)
- **Routing**: React Router v7
- **Forms & Validation**: React Hook Form with Zod schemas
- **Build Tool**: Vite
- **Testing**: Vitest, React Testing Library, and jsdom

### Backend API (`server/`)
- **Framework**: Laravel 12 on PHP 8.4+
- **Authentication**: Laravel Sanctum Bearer tokens
- **Database**: PostgreSQL 15+ (Production) / SQLite (Local development & automated test isolation)
- **PDF Engine**: Barryvdh Laravel DomPDF
- **Code Style**: Laravel Pint (PSR-12 compliant)
- **Testing**: PHPUnit

---

## 3. Architecture & Operating Modes

Smart HR supports two operational modes:

1. **Connected API Mode (Production & Staging)**:
   - Configured by setting `VITE_API_BASE_URL` in `client/.env.production` or local environment.
   - All data is persisted in a relational database with backend authorization and transactional locking.
2. **Demo Mode (Local Browser Storage)**:
   - Activates automatically when `VITE_API_BASE_URL` is omitted.
   - Persists data in browser `localStorage` using 5 pre-loaded synthetic employee accounts (`EMP-1001` to `EMP-1005`).
   - Enables evaluation of UI workflows without requiring backend setup.

---

## 4. Local Installation & Development

### 4.1 Prerequisites
- **Node.js**: `20.x` or higher
- **PHP**: `8.4` or higher with extensions: `pdo_sqlite`, `pdo_pgsql`, `mbstring`, `openssl`, `xml`, `bcmath`, `gd`, `intl`
- **Composer**: `2.x`

### 4.2 Backend Setup (`server/`)
```bash
cd server

# Install dependencies
composer install

# Copy environment configuration
cp .env.example .env

# Generate application encryption key
php artisan key:generate

# Run database migrations and seed statutory rules + synthetic demo accounts
# (Set DEMO_SEED_PASSWORD to seed test accounts in non-production environments)
export DEMO_SEED_PASSWORD="DemoPassword!2026"
php artisan migrate:fresh --seed

# Start the Laravel development server
php artisan serve --port=8000
```

### 4.3 Frontend Setup (`client/`)
```bash
cd client

# Install dependencies
npm install

# Connect to local API server (optional; omit for local Demo Mode)
export VITE_API_BASE_URL="http://127.0.0.1:8000/api"

# Start Vite development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 5. Verification & Testing Commands

To run all automated quality gates:

```bash
# Frontend: Lint, Typecheck, Unit/Integration Tests, Production Build
cd client
npm run lint
npx tsc -b
npm test
npm run build

# Backend: Code Style, Migrations, Full Test Suite, Route Audit
cd ../server
./vendor/bin/pint --test
php artisan test
php artisan route:list --path=api
```

---

## 6. Pre-Seeded Demonstration Accounts

When `DEMO_SEED_PASSWORD` is configured, the following accounts are available for testing:

| Role | Email | Employee ID | Name | Department |
| :--- | :--- | :--- | :--- | :--- |
| **HR Admin** | `alex.rivera@smarthr.demo` | `EMP-1005` | Alex Rivera | Human Resources |
| **HR Coordinator** | `priya.nair@smarthr.demo` | `EMP-1002` | Priya Nair | Human Resources |
| **Manager** | `dana.reyes@smarthr.demo` | `EMP-1004` | Dana Reyes | Engineering |
| **Employee** | `jordan.taylor@smarthr.demo` | `EMP-1001` | Jordan Taylor | Engineering |
| **Employee (Probation)** | `marcus.chen@smarthr.demo` | `EMP-1003` | Marcus Chen | Finance |

---

## 7. Documentation Index

Comprehensive guides are available in the [`docs/`](docs/) directory:

### Core System Guides
- [User Guide](docs/USER_GUIDE.md): Role-specific usage instructions for Administrator, HR, Manager, and Employee workflows.
- [Administrator Guide](docs/ADMINISTRATOR_GUIDE.md): Production deployment, PostgreSQL setup, backup & restore procedures, and security configurations.
- [System Limitations & Unconfigured Policies](docs/LIMITATIONS.md): Transparent accounting of incomplete, mocked, or policy-dependent features.
- [Commercial Pilot Runbook & Demo Script](docs/PILOT_RUNBOOK.md): Step-by-step 8-stage customer demonstration walkthrough, pilot checklist, and compliance review.
- [Deployment & Recovery Guide](server/DEPLOYMENT_AND_RECOVERY.md): PostgreSQL database configuration and disaster recovery procedures.

### Commercial Productization Suite (Phase 9)
- [Commercial Product Overview](docs/PRODUCT_OVERVIEW.md): System vision, target market, module status, and regulatory alignment.
- [Customer Onboarding Guide & Checklist](docs/CUSTOMER_ONBOARDING.md): 10-step repeatable onboarding workflow, CSV ingestion templates, and handover sign-off.
- [Commercial Deployment & Architecture Guide](docs/DEPLOYMENT_GUIDE.md): Architecture evaluation (Single-tenant vs Multi-tenant), production server sizing, and Nginx reverse proxy.
- [Licensing & Subscription Strategy](docs/LICENSING_STRATEGY.md): Commercial licensing tiers, lifecycle, and non-punitive data preservation policy.
- [System Maintenance & Update Guide](docs/MAINTENANCE_GUIDE.md): Scheduled maintenance, pre-update snapshots, database migration strategy, and fast rollback runbook.
- [Customer Support Policy Draft](docs/SUPPORT_POLICY_DRAFT.md): Support channels, Severity 1–4 classifications, proposed target SLAs, and escalation ladder.
- [Commercial Pricing Strategy & Cost Model](docs/PRICING_STRATEGY.md): Proposed PHP pricing packages (Starter, Professional, Enterprise) and operational cost/profitability breakdown.
- [Commercial Readiness & Compliance Assessment](docs/COMMERCIAL_READINESS.md): Objective 12-point readiness audit, verified capabilities, and Phase 10 roadmap.

---

## 8. Repository Structure

```
enterprise-hr-management/
├── client/                       # React 19 / TypeScript Single Page Application
│   ├── src/
│   │   ├── components/           # Reusable UI & Layout components
│   │   ├── features/
│   │   │   ├── api/              # Axios HTTP client, token storage & interceptors
│   │   │   ├── attendance/       # Clock-in/out, timezone math & attendance table
│   │   │   ├── auth/             # Context store, RBAC permissions & security audit
│   │   │   ├── employees/        # Directory roster, registration & validation
│   │   │   ├── leave/            # Leave request forms, review queue & validation
│   │   │   ├── payroll/          # Calculations, periods, compensation & payslips
│   │   │   └── reports/          # KPI analytics, date filters & CSV export
│   │   ├── pages/                # Route page components
│   │   ├── routes/               # AppRouter & ProtectedRoute definitions
│   │   └── types/                # Domain TypeScript interfaces & types
│   ├── dist/                     # Compiled production build artifacts
│   └── package.json
├── server/                       # Laravel 12 REST API
│   ├── app/
│   │   ├── Console/Commands/     # Custom Artisan commands (verify-onboarding)
│   │   ├── Http/Controllers/Api/ # REST API controllers (incl. CompanyController)
│   │   ├── Http/Middleware/      # Active employee & auth middleware
│   │   ├── Http/Transformers/    # Presenters & DTO serializers
│   │   ├── Models/               # Eloquent models
│   │   ├── Services/Payroll/     # Statutory calculation engine & workflow
│   │   └── Support/              # RolePermissions matrix
│   ├── config/                   # Configuration files (incl. smarthr.php)
│   ├── database/
│   │   ├── migrations/           # PostgreSQL/SQLite database schema definitions
│   │   └── seeders/              # Statutory rule & demo account seeders
│   ├── routes/api.php            # Sanctum authenticated API endpoints
│   └── tests/                    # Feature & Unit PHPUnit test suites
└── docs/                         # System manuals, runbooks & commercial suite
    ├── ADMINISTRATOR_GUIDE.md
    ├── COMMERCIAL_READINESS.md
    ├── CUSTOMER_ONBOARDING.md
    ├── DEPLOYMENT_GUIDE.md
    ├── LICENSING_STRATEGY.md
    ├── LIMITATIONS.md
    ├── MAINTENANCE_GUIDE.md
    ├── PILOT_RUNBOOK.md
    ├── PRICING_STRATEGY.md
    ├── PRODUCT_OVERVIEW.md
    ├── SUPPORT_POLICY_DRAFT.md
    └── USER_GUIDE.md
    ├── USER_GUIDE.md
    ├── ADMINISTRATOR_GUIDE.md
    ├── LIMITATIONS.md
    └── PILOT_RUNBOOK.md
```

