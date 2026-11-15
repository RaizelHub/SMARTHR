# Smart HR — Commercial Licensing & Subscription Strategy

## 1. Executive Summary & Licensing Objectives

The Smart HR licensing framework is designed to provide commercial flexibility, legal compliance certainty, and operational predictability for Philippine enterprise customers.

The licensing architecture balances two foundational commitments:
1. **Commercial Protection**: Ensuring that client deployments match their contracted employee tier and service agreement.
2. **Customer Data Sovereignty & Statutory Compliance**: Ensuring that under no circumstance is a customer locked out of their historical data, nor are historical employee or payroll records ever deleted when an agreement concludes. Philippine law (DOLE Department Order No. 174 and the National Internal Revenue Code) mandates 3-year to 5-year statutory retention periods for employment and tax records.

---

## 2. Licensing Models Evaluated

| Licensing Model | Description | Pros | Cons | Recommendation |
| :--- | :--- | :--- | :--- | :---: |
| **Monthly Subscription** | Recurring monthly fee based on company size. | Low barrier to entry for small businesses. | Higher churn; recurring collection friction in the Philippines. | **Supported** |
| **Annual Subscription** | Billed annually with a 2-month discount (12 months for the price of 10). | Predictable annual cash flow; reduced invoicing friction; preferred by Philippine corporate procurement. | Requires higher upfront budget approval from client. | **Preferred Standard** |
| **Perpetual License + Maintenance** | One-time software purchase with an optional 20% annual software maintenance & support fee. | Appealing to traditional Philippine corporations requiring on-premise installation. | Complex version branching; uneven revenue stream. | **Available on Request** |
| **Per-Employee Per-Month (PEPM)** | Metered monthly billing per active employee (e.g. PHP 65/employee/month). | Granular matching to headcount. | Unpredictable monthly invoices; resistance from SME finance departments seeking fixed budgets. | **Not Recommended for Pilot** |
| **Tiered Company Licensing** | Flat monthly/annual fee per employee bracket (1–25, 26–100, 101–300). | Fixed, predictable corporate budgeting; straightforward contract terms. | Headcount jumps near bracket boundaries. | **Recommended Standard** |

---

## 3. Recommended Commercial Framework: Tiered Annual & Monthly Subscription

Smart HR adopts a **Tiered Per-Company Subscription Model** with annual billing as the primary recommendation:

- **Starter Tier**: Designed for micro/small businesses with up to **25 active employees**.
- **Professional Tier**: Designed for growing organizations with up to **100 active employees**.
- **Enterprise Tier**: Designed for larger entities with **101 to 300+ active employees**.

---

## 4. Technical License Specification

### 4.1 License Parameters Schema

A Smart HR license payload comprises the following standardized metadata:

```json
{
  "customerId": "CUST-PH-2026-0042",
  "customerName": "Acme Solutions Philippines, Inc.",
  "taxId": "123-456-789-000",
  "plan": "Professional",
  "maxActiveEmployees": 100,
  "features": [
    "employees.roster",
    "attendance.tracking",
    "leave.management",
    "reports.analytics",
    "payroll.philippine_statutory",
    "payslip.pdf_export"
  ],
  "issuedAt": "2026-01-01T00:00:00Z",
  "expiresAt": "2027-01-01T00:00:00Z",
  "gracePeriodDays": 14,
  "signature": "hmac_sha256_cryptographic_signature"
}
```

### 4.2 License Status Lifecycle

```
┌────────────────────────────────────────────────────────────────────────┐
│                        License State Transitions                       │
│                                                                        │
│   [Active] ─────────────> [Grace Period] ──────────> [Read-Only]       │
│      ▲                          │                         │            │
│      │                          ▼                         ▼            │
│      └───────────────── [Renewed / Paid] ─────────────────┘            │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Active**:
   - License is valid and within contracted dates (`now <= expiresAt`).
   - All modules, creation, editing, and calculations operate without restriction.
2. **In Grace Period (14 Calendar Days)**:
   - Enters this state immediately if `now > expiresAt` but `now <= (expiresAt + 14 days)`.
   - The application displays an administrative notification banner: *"Your subscription expired on [Date]. Your account is currently in a 14-day administrative grace period. Please contact billing to avoid workflow interruptions."*
   - Normal workflows continue operating to avoid halting urgent semi-monthly payroll runs.
3. **Expired (Read-Only Mode)**:
   - Enters this state if the 14-day grace period elapses without renewal (`now > expiresAt + 14 days`).
   - **Data Preservation Guarantee**: All employee, attendance, leave, tax, and historical payroll records remain 100% accessible.
   - **Permitted Actions**: Users can log in, view historical records, download previous payslip PDFs, and export CSV audit reports for BIR/DOLE inspections.
   - **Restricted Actions**: Creating new employees, clocking in/out, submitting new leave requests, or calculating new payroll periods is paused.
   - **No Data Deletion**: Customer records are NEVER deleted due to subscription expiration.
4. **Suspended**:
   - Applied only upon explicit written customer termination or formal security suspension. Login is restricted, but the database snapshot is archived and delivered to the client.

---

## 5. Safe Technical Implementation Design (Phase 10 Target)

To prevent brittle network dependencies, Smart HR does **NOT** rely on a real-time external "phone-home" verification server that would disable customer operations during internet outages.

Instead, the proposed technical implementation uses **Cryptographic Offline Verification**:
1. When a contract is signed or renewed, the Smart HR provisioning portal generates a JSON Web Signature (JWS) or HMAC-SHA256 signed license key containing the contracted dates and employee limits.
2. The key is placed in `server/.env` as `SMARTHR_LICENSE_KEY`.
3. The Laravel backend verifies the cryptographic signature locally using an embedded public key.
4. The system validates the license status during periodic scheduled tasks or admin health checks.
5. In Phase 9, license metadata is represented cleanly via `server/config/smarthr.php` and can be inspected via the authenticated `GET /api/company` endpoint.

---

## 6. Payment Processing & Data Security Boundaries

- **No Live Payment Gateway in this Phase**: Smart HR does not process credit cards, debit cards, or e-wallet payments directly within the application.
- **Corporate Invoicing**: All subscription billing for Philippine commercial customers is handled via traditional corporate invoicing (Official Receipts, BIR 2307 withholding certificates, corporate bank transfers, or check payments).
- **Zero Cardholder Data**: The system stores zero credit card numbers, CVVs, or bank account credentials, completely eliminating PCI-DSS compliance scope.

