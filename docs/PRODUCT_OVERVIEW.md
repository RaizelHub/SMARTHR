# Smart HR — Commercial Product Overview

## 1. Executive Summary

**Smart HR** is an enterprise-grade Human Resources Management and Payroll Compliance System engineered specifically for Small and Medium-sized Enterprises (SMEs) operating in the Philippines.

The platform unifies core workforce administration—employee directories, biometric-compatible attendance tracking, leave request approval queues, workforce analytics, and Philippine statutory payroll compliance—into a cohesive, secure application.

Smart HR addresses the critical administrative burden faced by Philippine business owners, HR managers, and finance officers: reconciling daily attendance records with complex Philippine labor laws, social legislation contributions (SSS, PhilHealth, Pag-IBIG), and Bureau of Internal Revenue (BIR) withholding tax calculations.

---

## 2. Target Market & Ideal Customer Profile

- **Primary Market**: Philippine Small and Medium Enterprises (SMEs) with **10 to 300 employees**.
- **Key Industry Sectors**:
  - Information Technology, Software, and Business Process Outsourcing (BPO)
  - Professional Services (Legal, Accounting, Consulting, Architecture)
  - Retail, Wholesale Distribution, and Logistics
  - Light Manufacturing and Commercial Trading
  - Non-Governmental Organizations (NGOs) and Educational Institutions
- **Buyer Personas**:
  - **Managing Director / Chief Executive Officer**: Desires compliance certainty, reduction of payroll errors, and protection against DOLE labor audit penalties.
  - **Human Resources Director / Coordinator**: Needs an intuitive employee directory, paperless leave workflows, and transparent role-based access.
  - **Finance & Payroll Officer**: Requires automated, verifiable gross-to-net payroll calculations matching official statutory circulars, itemized employer contributions, and audit-ready payslips.

---

## 3. Core Architecture & Technology Stack

Smart HR utilizes a modern, decoupled full-stack architecture:

- **Frontend Application (`client/`)**:
  - Built with **React 19**, **TypeScript** (strict mode), **React Router v7**, and **Tailwind CSS v4**.
  - Dual Operating Mode: Supports both **Connected API Mode** (communicating with the Laravel Sanctum backend) and **Offline Demo Mode** (in-browser `localStorage` mirror for sales walkthroughs and stakeholder evaluations).
  - Responsive design optimized for desktop workstations, tablets, and mobile browsers.
- **Backend API Application (`server/`)**:
  - Built with **Laravel 12** on **PHP 8.4+**.
  - Token-based API authentication powered by **Laravel Sanctum**.
  - Authoritative middleware (`EnsureActiveEmployee`) that blocks and revokes tokens for deactivated personnel in real time.
  - Transactional integrity (`DB::transaction` with row-level locks) preventing concurrent double clock-in or duplicate leave approvals.
- **Database Layer**:
  - **PostgreSQL 15+ / 16+** in staging and production environments.
  - SQLite in-memory (`:memory:`) and file-backed database for local workstation development and automated regression testing.
  - Foreign key constraints configured with `ON DELETE RESTRICT` to prevent accidental cascading deletion of historical payroll, tax, attendance, or leave records.
- **Reporting & Document Generation**:
  - Official A4 employee payslip generation using **Barryvdh DomPDF**.
  - RFC 4180-compliant CSV data exports with formula injection sanitization.

---

## 4. Module Status: Implemented vs. Planned

| Module | Features Actually Implemented | Status | Planned Future Enhancements |
| :--- | :--- | :---: | :--- |
| **Authentication & RBAC** | Sanctum Bearer tokens; `EnsureActiveEmployee` middleware; 4 roles (HR Admin, HR Coord, Manager, Employee); last-admin protection. | **Implemented** | Two-Factor Authentication (2FA/MFA via TOTP); Single Sign-On (Google Workspace / Microsoft 365 SAML). |
| **Employee Management** | Directory roster; scoped viewing; registration with validation; inline status updates; historical delete protection. | **Implemented** | Bulk employee CSV import wizard; custom document attachments (contracts, IDs); custom employee fields. |
| **Attendance Management** | Single-click clock-in/out; duplicate lock; duration tracking; overnight shift handling; `Asia/Manila` timezone. | **Implemented** | Biometric hardware webhook integration (ZKTeco); geofenced mobile clock-in; automated shift schedule engine. |
| **Leave Management** | Request submission; calendar days calc; overlap validation; self-service cancellation; review queue; self-approval prevention. | **Implemented** | Automated Service Incentive Leave (SIL) 5-day annual accrual; company leave balance balances & carry-over rules. |
| **Reports & Analytics** | Workforce KPIs; attendance totals; leave distribution; date range filters; CSV export with injection defense. | **Implemented** | Automated PDF executive summary reports; scheduled email reports; headcount turnover trend charts. |
| **Philippine Payroll** | SSS 2025 rates; PhilHealth 5%; Pag-IBIG Circular 460; BIR TRAIN tables; 5-stage approval workflow; A4 PDF payslips. | **Implemented** | Bank electronic fund transfer (EFT) batch export (BDO, BPI, Metrobank); automated 13th-month pay prorating; BIR 2316. |
| **Company & Licensing** | Company profile configuration; license metadata reader; pre-flight onboarding verification command. | **Implemented** | Customer billing portal; automated license renewal webhooks. |

---

## 5. Regulatory Alignment

Smart HR has been designed to align with Philippine statutory standards:

1. **Republic Act No. 10173 (Data Privacy Act of 2012)**:
   - Data minimization: Employees cannot view coworker salary records or unauthorized departmental data.
   - Access control: Role-based permissions limit administrative capabilities to authorized HR and management staff.
   - Audit trail: High-risk administrative actions (role updates, permission denials, deactivations) are logged to an append-only `security_audit_logs` table.
2. **Social Security Act of 2018 (Republic Act No. 11199)**:
   - SSS contribution rates calculated in accordance with SSS Circular No. 2024-006 (15% total contribution split: 5% employee, 10% employer; mandatory WISP for monthly salary credits exceeding PHP 20,000; Employees' Compensation fund separation).
3. **Universal Health Care Act (Republic Act No. 11223)**:
   - PhilHealth premium calculation at the 5.0% premium rate with equal 50/50 cost sharing, subject to the statutory floor (PHP 10,000) and ceiling (PHP 100,000).
4. **Home Development Mutual Fund Law of 2009 (Republic Act No. 9679)**:
   - Pag-IBIG Fund monthly deduction in accordance with Circular No. 460 (2% employee contribution up to maximum mandatory monthly salary credit, 2% employer match).
5. **Tax Reform for Acceleration and Inclusion (TRAIN Law — Republic Act No. 10963)**:
   - Semi-monthly and monthly graduated withholding tax tables for compensation income, automatically computing taxable compensation net of statutory social contributions.

---

## 6. Commercial Positioning & Roadmap

Smart HR is currently positioned for **Controlled Commercial Pilots** with forward-thinking Philippine enterprises.

- **Phase 9 Milestone**: Complete customer onboarding workflows, single-tenant deployment architecture, licensing design, maintenance guides, support policies, and transparent SMB pricing models.
- **Phase 10 Target Roadmap**:
  - Proprietary commercial bank disbursement batch files (BDO EPCI, BPI BizLink, Metrobank MBOS, UnionBank).
  - Shift scheduling and automatic tardiness / undertime deduction calculator.
  - Automated annual Service Incentive Leave (SIL) balance accrual engine.

