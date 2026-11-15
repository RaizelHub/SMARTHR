# Smart HR — Customer Onboarding Guide & Checklist

This document details the repeatable, 10-step onboarding process for provisioning, configuring, verifying, and handing over a new Smart HR instance to an enterprise client.

---

## 1. 10-Step Customer Onboarding Workflow

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Customer Onboarding Stages                        │
│                                                                        │
│   [1. Registration] ──> [2. Initial Admin]  ──> [3. Company Config]    │
│           │                                              │             │
│           ▼                                              ▼             │
│   [4. Schedules]    ──> [5. Leave Policy]   ──> [6. Payroll Rules]     │
│           │                                              │             │
│           ▼                                              ▼             │
│   [7. Employee Roster] ─> [8. Roles & Scopes]─> [9. Verification]      │
│                                                          │             │
│                                                          ▼             │
│                                                 [10. Handover]         │
└────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Customer Registration & Company Information
Gather and record the customer's statutory corporate details into `server/.env` (or server configuration management):
- **Legal Entity Name**: e.g., `Acme Solutions Philippines, Inc.`
- **Trading / Brand Name**: e.g., `Acme Tech`
- **Tax Identification Number (TIN)**: e.g., `123-456-789-000`
- **SSS Employer Number**: e.g., `01-2345678-9`
- **PhilHealth Employer Number**: e.g., `12-345678901-2`
- **Pag-IBIG Employer Number**: e.g., `1234-5678-9012`
- **Registered Business Address**: Full physical office address
- **Authorized Contact Person & Email**: Primary liaison for billing and administrative notices

### Step 2: Initial Administrator Account Creation
Provision the root organizational administrator account:
```bash
cd server
php artisan tinker --execute="
  \$user = App\Models\User::create([
    'name' => 'Maria Santos',
    'email' => 'admin@acme.com.ph',
    'password' => Illuminate\Support\Facades\Hash::make('TemporaryInitialPassword!2026')
  ]);
  App\Models\Employee::create([
    'user_id' => \$user->id,
    'employee_code' => 'EMP-0001',
    'full_name' => 'Maria Santos',
    'work_email' => 'admin@acme.com.ph',
    'department' => 'Human Resources',
    'position' => 'HR Director',
    'employment_status' => 'Active',
    'assigned_role' => 'HR Admin',
    'hire_date' => '2026-01-01'
  ]);
"
```
*(Instruct the administrator to sign in and immediately change their password upon handover).*

### Step 3: Company Department & Organizational Configuration
Define active departments in agreement with the customer's organizational chart:
- Standard available departments: `Engineering`, `Human Resources`, `Finance`, `Operations`, `Marketing`, `Sales`, `Customer Support`, `Executive`.
- Ensure manager reporting relationships are identified for attendance and leave review scopes.

### Step 4: Working Schedule & Attendance Settings
Confirm company operating hours and business timezone:
- Business Timezone: Standardized to **`Asia/Manila` (`UTC+08:00`)**.
- Attendance Recording Mode: Desktop web browser clock-in/out.
- Shift Conventions: Acknowledge that recorded duration reflects clock-in to clock-out elapsed minutes, and payable hours require payroll officer confirmation.

### Step 5: Leave Policy Configuration
Review company leave entitlements with customer management:
- Confirm standard leave categories: `Vacation`, `Sick`, `Maternity`, `Paternity`, `Bereavement`, `Unpaid`.
- Explain overlap prevention: Employees cannot book duplicate dates or overlapping date ranges.
- Explain self-approval rule: Managers and HR staff cannot approve their own requests; another authorized reviewer must review.

### Step 6: Payroll Configuration
Establish the customer's payroll parameters:
- **Pay Frequency**: `Semimonthly` (e.g. 1st–15th paid on 15th, 16th–end-of-month paid on 30th/31st) or `Monthly`.
- **Statutory Rules**: Verify that SSS, PhilHealth, Pag-IBIG, and BIR rule tables are seeded using `php artisan db:seed --class=StatutoryRuleSeeder --force`.
- **Compensation Packages**: Set up base salaries and non-taxable de minimis allowances (e.g. Rice Subsidy up to PHP 2,000/month, Uniform Allowance).

### Step 7: Employee Data Ingestion
Ingest the client's workforce roster:
- **Method A (Interactive Form)**: HR Coordinator signs in to `/employees/new` and enters each employee record.
- **Method B (Batch Seeder / Artisan Script)**: Use a pre-formatted CSV template (schema detailed in Section 3 below) to seed all employee and compensation records atomically.

### Step 8: Role & Permission Assignment
Audit role assignments across the roster:
- **HR Admin**: 1 to 2 senior HR executives (can manage roles, approve payroll, view audit logs).
- **HR Coordinator**: Operational HR staff (can register employees, update statuses, prepare payroll periods).
- **Manager**: Department heads (can review attendance and leave requests for their department).
- **Employee**: General staff (self-service profile, clock-in/out, personal leave, personal payslips).

### Step 9: Initial System Verification (Pre-Flight Check)
Execute the automated Smart HR onboarding verification command:
```bash
cd server
php artisan smarthr:verify-onboarding
```
Verify that all 7 checks pass:
1. Database connectivity & migrations complete.
2. Statutory rules present and active.
3. At least one active HR Administrator provisioned.
4. Business timezone configured to `Asia/Manila`.
5. Storage directories writable for DomPDF payslip generation.
6. Environment security (`APP_DEBUG=false` in production).
7. License plan metadata loaded.

### Step 10: Customer Handover & Training
Conduct a 60-minute remote or on-site walkthrough with client stakeholders:
- Review the [User Guide](USER_GUIDE.md).
- Demonstrate the 8-step live walkthrough using the [Commercial Pilot Runbook](PILOT_RUNBOOK.md).
- Obtain client sign-off on the Onboarding Acceptance Form.

---

## 2. Customer Onboarding Checklist

| # | Task | Owner | Verification Method | Status |
| :-: | :--- | :--- | :--- | :-: |
| 1 | Master Services Agreement & DPA Addendum signed | Commercial Lead | Executed PDF on file | [ ] |
| 2 | Dedicated VPS / Cloud instance provisioned | DevOps Engineer | SSH & TLS HTTPS check | [ ] |
| 3 | PostgreSQL database created with least-privilege user | DBA / DevOps | Schema permissions test | [ ] |
| 4 | `server/.env` configured with company statutory IDs | Deployment Eng | `php artisan config:show smarthr` | [ ] |
| 5 | Migrations & `StatutoryRuleSeeder` executed | Deployment Eng | `php artisan migrate:status` | [ ] |
| 6 | Initial HR Administrator user created | Deployment Eng | Login test at `/` | [ ] |
| 7 | Employee roster and compensations loaded | HR Consultant | Count matches customer headcount | [ ] |
| 8 | Test clock-in and clock-out executed | HR Consultant | Attendance history entry created | [ ] |
| 9 | Test leave request submitted and approved | HR Consultant | Leave request marked Approved | [ ] |
| 10 | Test draft payroll period calculated | Payroll Specialist | Net pay and statutory taxes verified | [ ] |
| 11 | Payslip PDF downloaded and reviewed | Payroll Specialist | SSS, PhilHealth, Pag-IBIG verified | [ ] |
| 12 | Pre-flight onboarding command passed | Deployment Eng | `php artisan smarthr:verify-onboarding` | [ ] |
| 13 | Administrator training completed | Customer Success | Training session recording archived | [ ] |
| 14 | Customer acceptance sign-off signed | Customer Lead | Written approval received | [ ] |

---

## 3. Data Ingestion CSV Specifications

### 3.1 Employee Roster Ingestion Schema (`employees.csv`)

| Column Header | Data Type | Required | Allowed Values / Format | Example |
| :--- | :--- | :---: | :--- | :--- |
| `employeeId` | String (unique) | Yes | 3–32 alphanumeric characters | `EMP-1001` |
| `fullName` | String | Yes | 2–120 characters | `Juan dela Cruz` |
| `workEmail` | String (unique) | Yes | Valid corporate email address | `juan.delacruz@company.ph` |
| `department` | String | Yes | Standard department list | `Engineering` |
| `position` | String | Yes | 2–100 characters | `Senior Systems Analyst` |
| `employmentStatus` | String | Yes | `Active`, `Probation`, `On Leave`, `Inactive` | `Active` |
| `hireDate` | Date | Yes | `YYYY-MM-DD` | `2024-03-15` |
| `assignedRole` | String | Yes | `Employee`, `Manager`, `HR Coordinator`, `HR Admin` | `Employee` |

### 3.2 Initial Compensation Ingestion Schema (`compensations.csv`)

| Column Header | Data Type | Required | Allowed Values / Format | Example |
| :--- | :--- | :---: | :--- | :--- |
| `employeeId` | String | Yes | Must match registered `employeeId` | `EMP-1001` |
| `payBasis` | String | Yes | `Monthly`, `Daily`, `Hourly` | `Monthly` |
| `baseAmountPhp` | Decimal | Yes | Greater than zero (2 decimal places) | `45000.00` |
| `allowancesJson` | JSON String | No | Array of `{ name, amountPhp, taxable }` | `[{"name":"Rice Subsidy","amountPhp":2000,"taxable":false}]` |
| `effectiveDate` | Date | Yes | `YYYY-MM-DD` | `2026-01-01` |

---

## 4. Customer Handover Acceptance Form

```
CUSTOMER HANDOVER & ACCEPTANCE SIGN-OFF

Customer Name: ____________________________________________________
Authorized Representative: __________________________________________
Deployment URL: ___________________________________________________
Onboarding Date: __________________________________________________

I, the undersigned authorized representative, hereby confirm that:
1. The Smart HR instance has been provisioned and configured in accordance
   with our agreed company specifications.
2. Initial administrator credentials have been delivered, verified, and updated.
3. Employee directory records have been loaded and verified for completeness.
4. Attendance, leave, and draft payroll workflows have been demonstrated.
5. System documentation (User Guide and Limitations) has been provided.

Client Signature: ___________________________    Date: ______________
Smart HR Lead Signature: ____________________    Date: ______________
```

