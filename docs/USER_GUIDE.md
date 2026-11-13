# Smart HR — User Guide

Welcome to **Smart HR**, an enterprise human resources management application designed for employee administration, attendance tracking, leave requests, workforce analytics, and Philippine statutory payroll compliance.

---

## 1. Overview & Operating Modes

Smart HR can operate in two distinct modes depending on your organization's deployment configuration:

1. **Connected API Mode (Production / Staging)**:
   - The web client communicates with a secure Laravel API server backed by a relational database (PostgreSQL in production, SQLite in local development).
   - Sessions are authenticated via Laravel Sanctum Bearer tokens.
   - All role-based access control (RBAC), data scoping, attendance timestamps, leave decisions, and statutory payroll calculations are enforced authoritatively by the server.
2. **Demo Mode (Local Browser Storage)**:
   - Used for evaluation and offline walkthroughs when `VITE_API_BASE_URL` is unconfigured.
   - Operates in browser `localStorage` using synthetic sample accounts (`EMP-1001` through `EMP-1005`).
   - Clearly flagged in the navigation bar with an amber `Demo Mode · Local RBAC` badge.

---

## 2. Role-Based Permissions & Scopes

Smart HR strictly enforces least-privilege role boundaries across all screens:

| Role | Employee Directory | Attendance | Leave Management | Reports & Analytics | Payroll & Payslips | Role Administration |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Administrator (HR Admin)** | Organization-wide; register employees; update status; delete/reset (demo) | Organization-wide history | Review queue for all departments; submit personal leave | Organization-wide analytics & CSV export | Manage compensation; create periods; calculate; review; approve; lock; view personal payslips | Full role assignment & security audit log |
| **HR Coordinator** | Organization-wide; register employees; update status | Organization-wide history | Review queue for all departments; submit personal leave | Organization-wide analytics & CSV export | Create compensation; create periods; calculate; submit for review; view personal payslips | View-only (cannot modify admin roles) |
| **People Manager** | Scoped to own department only | Scoped to department team members | Review queue for department team members; submit personal leave | Department-scoped analytics & CSV export | View personal payslips only | Access denied (`403`) |
| **Employee** | Personal profile only | Personal clock-in/out & history | Submit personal requests & cancel pending leave | Personal attendance/leave summary (exports hidden) | View personal payslips only | Access denied (`403`) |

---

## 3. Step-by-Step Workflows

### 3.1 Authentication & Sign In

1. Navigate to `/` (Sign In).
2. **In Connected API Mode**:
   - Enter your work email address (e.g. `jordan.taylor@smarthr.demo`) and your account password.
   - Click **Sign In**. On success, you are redirected to the Dashboard.
3. **In Demo Mode**:
   - Open the **Demo Account** dropdown.
   - Choose one of the 5 synthetic profiles (e.g., `EMP-1005 Alex Rivera (HR Admin)` or `EMP-1001 Jordan Taylor (Employee)`).
   - Click **Sign In**.

### 3.2 Main Navigation & Active Header

The top navigation bar dynamically adapts to your granted permissions:
- **Logo & Title**: Click **Smart HR** to return to the Dashboard.
- **Navigation Links**: Shows links only to routes you are authorized to view (`Dashboard`, `Employees`, `Register Employee`, `Attendance`, `Leave`, `Reports`, `Payroll`, `Access Control`).
- **Mode Badge**: Indicates `Demo Mode · Local RBAC` or `Laravel API · Sanctum Auth`.
- **User Pill**: Displays your full name, Employee ID, and active role.
- **Sign Out**: Ends your session, revokes your server token, and returns to the Sign In screen.

---

### 3.3 Employee Management (`/employees`)

- **Viewing the Roster**:
  - Regular employees see only their personal profile record.
  - Managers see employees belonging to their department.
  - HR personnel see all employees across the organization.
- **Registering a New Employee (`/employees/new`)**:
  - Authorized HR personnel fill out the registration form: Employee ID (e.g. `EMP-2001`), Full Name, Work Email, Department, Position, Status (Active, Probation, On Leave, Inactive), Hire Date, and Assigned Role.
  - The form validates against duplicate IDs and emails case-insensitively.
  - HR Coordinators cannot assign the `HR Admin` role; only active HR Admins can provision fellow administrators.
- **Updating Employment Status**:
  - HR personnel can change an employee's employment status directly via the **Update Status** dropdown in the roster table.
  - Setting an employee to **Inactive** immediately revokes their active login sessions.
  - The system blocks deactivating the last active HR Administrator to prevent organizational lockout.

---

### 3.4 Attendance Management (`/attendance`)

- **Business Timezone**: All shift dates and timestamps are displayed and evaluated in **Asia/Manila (`UTC+08:00`)**.
- **Clocking In**:
  - Click **Clock In** on the Current Work Session card.
  - The card transitions to `Clocked In` and records the start time in UTC while displaying local Manila time.
  - Duplicate clock-in attempts while a shift is active are blocked.
- **Clocking Out**:
  - When finished working, click **Clock Out**.
  - The system computes the total shift duration in minutes and stores the completed attendance record.
  - Overnight shifts that cross midnight local time are attributed to the initial clock-in business date.
- **Viewing Attendance History**:
  - Employees view their personal attendance log.
  - Managers view department attendance.
  - HR personnel view company-wide attendance.

---

### 3.5 Leave Management (`/leave`)

- **Submitting a Leave Request**:
  - Select the Leave Type: `Vacation`, `Sick`, `Maternity`, `Paternity`, `Bereavement`, or `Unpaid`.
  - Enter the Start Date and End Date. The system automatically computes the inclusive calendar day count.
  - Provide a brief reason and click **Submit Leave Request**.
  - The system validates date order and blocks requests that overlap with existing pending or approved leave dates.
- **Cancelling a Request**:
  - Employees can cancel their own pending requests at any time before review. Approved, rejected, or cancelled requests cannot be retracted.
- **Reviewing Leave (Managers & HR Staff)**:
  - Pending requests within your authorized scope appear in the **Leave Review Queue**.
  - Reviewers can filter requests by status (`All`, `Pending`, `Approved`, `Rejected`, `Cancelled`).
  - To approve or reject, enter optional reviewer notes, select **Approve** or **Reject**, and confirm the action.
  - **Self-Approval Protection**: The system strictly prevents managers or HR staff from approving their own leave requests.

---

### 3.6 Reports & Analytics (`/reports`)

- **Filter Bar**:
  - Filter analytics by Date Range (start and end date), Department, Employee, Employment Status, or Leave Status.
  - Quick-preset buttons: **All Recorded Dates**, **Current Month**, and **Last 30 Days**.
- **Analytics Sections**:
  - **Workforce Analytics**: Total headcount, active/probation/inactive counts, and department distribution breakdown.
  - **Attendance Analytics**: Total recorded sessions, total hours worked, and shift duration averages.
  - **Leave Analytics**: Distribution of leave requests by type and review status.
- **CSV Data Export**:
  - Authorized Managers and HR staff can download CSV exports for Employees, Attendance, and Leave.
  - All export files feature automatic CSV formula injection sanitization (prefixing dangerous characters `=`, `+`, `-`, `@` with a single quote).

---

### 3.7 Payroll Management (`/payroll`)

- **Access Scope**:
  - Regular Employees and Managers see only their personal payslips via **My Payslips**.
  - HR personnel access organization compensation records, payroll periods, and draft runs.
- **Compensation Setup**:
  - Authorized HR personnel configure employee pay basis (`Monthly`, `Daily`, `Hourly`), base compensation in Philippine Pesos (PHP), and optional non-taxable de minimis allowances (e.g. Rice Subsidy).
- **Payroll Period Lifecycle**:
  1. **Draft Period Creation**: Create a period (e.g. Semimonthly `2026-11-01` to `2026-11-15`).
  2. **Calculate**: Generates draft entries for all eligible employees with compensation records. Calculates SSS, PhilHealth, Pag-IBIG, and BIR withholding tax according to Philippine statutory rules.
  3. **Submit for Review**: Locks draft calculations against casual modification and advances status to `In Review`.
  4. **Approve**: HR Admin reviews statutory totals, gross pay, deductions, net pay, and employer costs, then issues final approval.
  5. **Lock**: Finalizes the run against any further amendments.
- **Payslip Preview & PDF Download**:
  - Click **View Payslip** on any entry.
  - Displays gross pay, itemized earnings, statutory employee deductions, BIR tax, net pay, and separated employer contribution costs.
  - Click **Download PDF** to export an official A4 payslip document (requires backend DomPDF).
  - Pre-approval payslips carry an explicit watermark: `PRE-APPROVAL PAYSLIP · NOT FOR PAYMENT`.

---

## 4. Error Handling & Session Recovery

- **Validation Errors**: Form fields with invalid or missing data display clear red outline indicators and inline error messages. Correct the flagged inputs and re-submit.
- **Session Expiry (HTTP 401)**: If your authentication token expires or is revoked, Smart HR automatically clears local session tokens and redirects you to `/` with a notification explaining that your session expired.
- **Network Disconnection**: If the API server cannot be reached, the system surfaces a retry banner without losing current page state. Click **Retry** once connectivity is restored.

