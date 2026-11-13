# Smart HR — Commercial Pilot Runbook & Customer Demonstration Script

This document details the repeatable setup procedures for customer demonstrations, the step-by-step business demonstration script, the commercial pilot evaluation checklist, and the statutory compliance review for prospective Philippine enterprise customers.

---

## 1. Demonstration Environment Setup

Smart HR includes a dedicated synthetic demonstration suite. It populates realistic employee accounts, compensation packages, attendance shifts, leave requests, and a calculated draft payroll period without using any real personal or financial information.

### 1.1 Local Demo Setup (Browser Storage / Offline Walkthrough)

- **Requirements**: Node.js 20+ LTS.
- **Steps**:
  ```bash
  cd client
  npm install
  npm run dev
  ```
- **Behavior**: With `VITE_API_BASE_URL` unset, Smart HR runs entirely in the browser using synthetic accounts (`EMP-1001` through `EMP-1005`). You can switch roles instantly from the login dropdown.

### 1.2 Connected API Demo Setup (Full-Stack Walkthrough)

- **Requirements**: PHP 8.4+, Node.js 20+, SQLite or PostgreSQL.
- **Steps**:
  ```bash
  # 1. Setup backend
  cd server
  composer install
  cp .env.example .env
  php artisan key:generate

  # 2. Reset database & seed synthetic demonstration dataset
  # (Production safeguard: DevPayrollUserSeeder aborts if APP_ENV=production)
  export DEMO_SEED_PASSWORD="DemoSecurePassword!2026"
  php artisan migrate:fresh --seed

  # 3. Start Laravel API development server
  php artisan serve --port=8000

  # 4. In a separate terminal, launch client connected to API
  cd ../client
  export VITE_API_BASE_URL="http://127.0.0.1:8000/api"
  npm run dev
  ```

### 1.3 Pre-Seeded Demonstration Accounts

All demo accounts share the password configured in `DEMO_SEED_PASSWORD`:

| Role | Employee Code | Work Email | Name | Department |
| :--- | :--- | :--- | :--- | :--- |
| **HR Administrator** | `EMP-1005` | `alex.rivera@smarthr.demo` | Alex Rivera | Human Resources |
| **HR Coordinator** | `EMP-1002` | `priya.nair@smarthr.demo` | Priya Nair | Human Resources |
| **People Manager** | `EMP-1004` | `dana.reyes@smarthr.demo` | Dana Reyes | Engineering |
| **Regular Employee** | `EMP-1001` | `jordan.taylor@smarthr.demo` | Jordan Taylor | Engineering |
| **Employee (Probation)** | `EMP-1003` | `marcus.chen@smarthr.demo` | Marcus Chen | Finance |

---

## 2. Customer Demonstration Script (8-Step Live Walkthrough)

Follow this exact sequence to showcase Smart HR's capabilities to prospective clients:

### Step 1: Administrator Logs In & Inspects Workspace
- **Account**: `alex.rivera@smarthr.demo` (HR Admin).
- **Actions**:
  1. Sign in. Show the Dashboard displaying organization-level cards and active role pill (`Alex Rivera · HR Admin`).
  2. Navigate to **Access Control** (`/roles`).
  3. Point out the real-time **Security Audit Log**, which captures all administrative actions, permission denials, and role updates.
  4. Demonstrate security controls: show that attempting to demote the sole active HR Admin account is blocked with a protective safeguard.

### Step 2: HR Staff Registers a New Employee
- **Account**: `priya.nair@smarthr.demo` (HR Coordinator).
- **Actions**:
  1. Sign in and navigate to **Register Employee** (`/employees/new`).
  2. Fill out the registration form:
     - Employee ID: `EMP-2001`
     - Full Name: `Samira Patel`
     - Work Email: `samira.patel@smarthr.demo`
     - Department: `Engineering`
     - Position: `Senior DevOps Engineer`
     - Status: `Active`
     - Hire Date: `2026-11-01`
     - Role: `Employee`
  3. Click **Register Employee**.
  4. Show the instant success feedback and navigate to **Employees** (`/employees`) to verify the new employee in the organization directory.

### Step 3: Employee Accesses Personal Profile
- **Account**: `jordan.taylor@smarthr.demo` (Jordan Taylor).
- **Actions**:
  1. Sign in as Jordan Taylor.
  2. Notice that the top navigation bar excludes administrative tabs (**Access Control** and **Register Employee** are absent).
  3. Navigate to **Employees** (`/employees`). Point out that Jordan only sees their personal profile record—coworker compensation and directory details are hidden.

### Step 4: Employee Records Attendance
- **Account**: `jordan.taylor@smarthr.demo`.
- **Actions**:
  1. Navigate to **Attendance** (`/attendance`).
  2. Point out the **Current Work Session** card displaying the local business timezone (`Asia/Manila`).
  3. Click **Clock In**. Show the status transition to `Clocked In` with the exact start time.
  4. Show that clicking **Clock In** a second time is disabled.
  5. Click **Clock Out**. Verify that the shift duration is computed and recorded in the attendance history table below.

### Step 5: Employee Submits a Leave Request
- **Account**: `jordan.taylor@smarthr.demo`.
- **Actions**:
  1. Navigate to **Leave** (`/leave`).
  2. Select Leave Type: `Vacation`.
  3. Choose dates: from 3 days from now to 5 days from now. Note the automatic calculation of calendar days.
  4. Reason: `Personal family vacation`.
  5. Click **Submit Leave Request**. Show that the request appears in the personal history table with status `Pending`.

### Step 6: Manager Reviews the Team Leave Request
- **Account**: `dana.reyes@smarthr.demo` (Dana Reyes, Engineering Manager).
- **Actions**:
  1. Sign in as Dana Reyes.
  2. Navigate to **Leave** (`/leave`).
  3. Show the **Manager & HR Leave Review Queue** showing Jordan Taylor's pending request.
  4. Explain scoping: Dana sees Engineering team requests, but cannot see Finance or HR employee requests.
  5. Demonstrate **Self-Approval Prevention**: Show that Dana cannot approve their own requests.
  6. Enter Reviewer Note: `Approved. Project coverage confirmed.`
  7. Click **Approve** and confirm. Show the status update to `Approved`.

### Step 7: HR Reviews Workforce Reports & Analytics
- **Account**: `alex.rivera@smarthr.demo` (HR Admin).
- **Actions**:
  1. Navigate to **Reports** (`/reports`).
  2. Show real-time aggregates across Workforce, Attendance, and Leave sections.
  3. Apply the **Department: Engineering** filter to see scoped statistics.
  4. Click **Export Employees (CSV)**. Show that the generated file downloads with sanitized cells protecting against spreadsheet formula injection.

### Step 8: Authorized Payroll Staff Previews Draft Payslip & Statutory Breakdown
- **Account**: `alex.rivera@smarthr.demo` (HR Admin).
- **Actions**:
  1. Navigate to **Payroll** (`/payroll`).
  2. Show the active semimonthly payroll period.
  3. Open the **Draft Payroll Entries** table. Point out Jordan Taylor's entry:
     - Gross Pay: Base salary + non-taxable de minimis rice subsidy.
     - Itemized Deductions: Exact Philippine statutory employee contributions (SSS, PhilHealth, Pag-IBIG, and BIR withholding tax).
     - Net Pay: Clear, non-negative calculation.
     - Separated Employer Costs: Clearly delineated employer statutory contribution expenses.
  4. Click **View Payslip**. Show the official payslip modal with print preview and **Download PDF** button.
  5. Note the honest watermark: `PRE-APPROVAL PAYSLIP · NOT FOR PAYMENT`.

---

## 3. Commercial Pilot Readiness Checklist

| Evaluation Area | Status | Verification Detail | Pilot Recommendation |
| :--- | :---: | :--- | :--- |
| **Authentication & RBAC** | **PASS** | Role scoping and token revoking verified on backend and frontend | Ready for pilot users across all 4 roles |
| **Employee Roster** | **PASS** | Case-insensitive uniqueness, scoped directory, inline status management | Ready for pilot employee onboarding |
| **Attendance Logging** | **PASS** | `Asia/Manila` timezone, duplicate clock-in lock, overnight duration handling | Ready for desktop browser attendance tracking |
| **Leave Management** | **PASS** | Date order, overlap prevention, review queue, self-approval block | Ready for leave approval workflow |
| **Reports & Export** | **PASS** | Headcount, hours worked, leave distribution, sanitized CSV export | Ready for HR and Manager reporting |
| **Philippine Statutory Math** | **PASS** | SSS 2025 rates, PhilHealth 5%, Pag-IBIG Circular 460, BIR TRAIN tables verified | Ready for payroll calculation verification |
| **Payroll Approval Workflow** | **PASS** | Draft -> In Review -> Approved -> Locked with optimistic locking (`version`) | Ready for internal accounting review |
| **Automated Regression Tests** | **PASS** | 18 frontend suites (91 tests), 17 backend suites (246 assertions) passing | Continuous regression safeguard active |
| **Database & Backups** | **PASS** | PostgreSQL-ready DDL, `restrictOnDelete()` FKs, documented `pg_dump`/verify runbook | Ready for dedicated staging DB deployment |
| **Bank Payment Files** | **BLOCKED** | Direct electronic funds transfer and bank upload files unbuilt | Manual payroll disbursement required |
| **Shift/Tardiness Automation** | **BLOCKED** | Company work shift schedules and tardiness deduction formulas unconfigured | Manual review of confirmed payable units required |
| **Leave Balance Accrual** | **BLOCKED** | Automatic monthly leave accrual and balance tracking not implemented | External leave balance tracking required |

---

## 4. Statutory Compliance & Data Privacy Review

### 4.1 Philippine Data Privacy Act of 2012 (Republic Act No. 10173)

- **Principle of Proportionality & Scoping**: Smart HR enforces strict data minimization. Regular employees can only view their personal records (`employees.read_own`), preventing unauthorized access to coworker salaries, addresses, or identification numbers.
- **Auditability**: Administrative actions (role changes, employee creations, deletions, and access denials) are recorded in an append-only `security_audit_logs` table.
- **Session Revocation**: Deactivated employee accounts (`Inactive`) immediately lose active access tokens.

### 4.2 Philippine Labor Standards (DOLE) & Tax Compliance (BIR)

- **Statutory Rules Database**: Contribution schedules for SSS, PhilHealth, Pag-IBIG, and BIR withholding tax are stored in a versioned `payroll_statutory_rule_versions` table referencing official circular numbers.
- **Employer Cost Separation**: Employer contributions are strictly separated from employee take-home deductions to avoid illegal wage deductions under Article 116 of the Philippine Labor Code.
- **Watermarked Payslips**: Draft payslips carry explicit notices stating they are internal draft calculations and not final receipts for cash disbursement.

