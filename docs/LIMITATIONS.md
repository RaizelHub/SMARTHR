# Smart HR — System Limitations & Unconfigured Policies

This document transparently records features that are incomplete, mocked, awaiting customer policy confirmation, or intentionally excluded from the current Smart HR version.

---

## 1. Philippine Labor & Payroll Policy Gaps (Awaiting Business Rules)

Smart HR's calculation engine models the statutory formulas mandated by Republic Acts and circulars (SSS Circular No. 2024-006, PhilHealth Circular No. 2020-0005 / UHC Act, Pag-IBIG Circular No. 460, and BIR TRAIN Law withholding tax tables). However, the following company-specific policies are unconfigured:

1. **Shift Schedules & Attendance Evaluation**:
   - The system records clock-in/out event timestamps in `Asia/Manila` and calculates duration in minutes.
   - There is currently **no automated shift assignment engine** (e.g. standard 8:00 AM – 5:00 PM shift, rotating shifts, or night shifts).
   - Tardiness, undertime penalties, and unworked absence deductions are **not automatically computed** from attendance records.
   - Payslips explicitly flag `recordedDurationEqualsPayableHours: false` to remind payroll officers that confirmed payable units must be verified.
2. **Overtime & Holiday Premium Multipliers**:
   - Philippine Labor Code provisions specify standard multipliers: regular overtime (+25%), rest day / special holiday (+30%), and regular holiday (+100%).
   - Night shift differential (10% for hours between 10:00 PM and 6:00 AM) is not automatically detected from attendance timestamps.
   - Payroll preparers can manually input overtime earnings as adjustment line items, but an automated rules engine has not been implemented.
3. **Leave Accrual & Balance Entitlements**:
   - Philippine law mandates 5 days of Service Incentive Leave (SIL) for employees with at least one year of service. Most commercial employers provide separate Vacation and Sick leave allowances (e.g., 12–15 days annually) with custom rollover or forfeiture rules.
   - Smart HR validates date ranges, computes inclusive calendar days, and prevents overlapping leave requests. However, **leave balance tracking and monthly accrual are disabled** (`leaveBalanceTrackingSupported: false`).
   - The application does not automatically deduct unworked leave days from salary.
4. **13th Month Pay & Annual Tax Reconciliation**:
   - 13th month pay prorating across the calendar year is not automated.
   - Annual BIR withholding tax reconciliation (Form 2316 year-end annualized tax check against the PHP 90,000 non-taxable bonus threshold) is not included in the semi-monthly pay run.

---

## 2. Banking, Disbursement & Government EDI Limitations

1. **No Live Payment Processing or Bank File Export**:
   - Smart HR is an internal payroll calculation and HR management system.
   - It **does NOT disburse money** or connect directly to bank payment gateways.
   - It does not currently generate proprietary commercial bank batch upload formats (e.g., BDO, BPI BizLink, Metrobank MBOS, UnionBank The Portal, PESONet, or InstaPay formats).
2. **No Direct Government Portal Submissions**:
   - The system calculates employee deductions and employer shares for SSS, PhilHealth, Pag-IBIG, and BIR.
   - It does **not transmit electronic forms or EDI filings** (e.g., SSS AMS, PhilHealth EPRS, Pag-IBIG e-SRS, or BIR eFPS/Alphalist). Remittance summaries must be referenced manually by authorized accounting personnel.

---

## 3. Host Environment & Deployment Limitations

1. **Local Development Host**:
   - Development and testing on this local Windows workstation use PHP 8.4 with `pdo_pgsql` and `pdo_sqlite` extensions.
   - PostgreSQL client CLI utilities (`psql`, `pg_dump`, `createdb`) and a running PostgreSQL service are **not installed** on this local workstation.
   - Automated testing verifies PostgreSQL-compatible DDL, transactional behavior, and schema design via SQLite `:memory:` and file-backed databases.
   - Staging and production deployments must run on a provisioned Linux server with a live PostgreSQL instance.

---

## 4. Multi-Tenancy & Commercial SaaS Infrastructure

1. **Single-Tenant Architecture**:
   - Smart HR is designed as an enterprise single-tenant application (one isolated database and application deployment per enterprise customer).
   - It does **not include multi-tenant schema partitioning**, tenant subdomains, or self-service organization signup.
2. **No In-App Billing or Subscription Metering**:
   - The system has no credit card processing, billing subscriptions, or seat license enforcement.
   - Licensing must be managed contractually.

