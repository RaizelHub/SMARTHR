# Smart HR — Commercial Pricing Strategy & Cost Model (Proposed Estimates)

> [!IMPORTANT]
> **Proposed Commercial Estimates**: The prices, fees, and tiers outlined in this document are proposed estimates formulated for commercial pilot evaluation, financial modeling, and stakeholder review. They do not constitute fixed public market quotes and are subject to adjustment based on infrastructure costs, legal reviews, and enterprise negotiation.

---

## 1. Commercial Context for Philippine SMEs

In the Philippines, human resources and payroll administration for businesses with 10 to 100 employees is historically fragmented:
- **Traditional Methods**: High reliance on manual spreadsheets (Excel/Google Sheets), physical Bundy clocks, and paper leave slips, resulting in frequent statutory computation errors, overtime miscalculations, and BIR audit friction.
- **Enterprise Legacy Software**: Complex ERP software (SAP, Oracle) is prohibitively expensive (hundreds of thousands of pesos in license and implementation fees) and poorly tailored to Philippine statutory circular updates.
- **Market Opportunity**: A predictable, fixed-bracket subscription model tailored to local labor standards and statutory social legislation (SSS, PhilHealth, Pag-IBIG, TRAIN Law withholding tax) provides strong appeal to SME business owners and finance directors.

---

## 2. Proposed Commercial Packages

All prices are quoted in **Philippine Pesos (PHP)** and exclude applicable Value-Added Tax (VAT).

| Commercial Feature | Starter Tier | Professional Tier (Standard) | Enterprise Tier |
| :--- | :---: | :---: | :---: |
| **Target Organization Size** | 1 to 25 Employees | 26 to 100 Employees | 101 to 300+ Employees |
| **Primary Use Case** | Small teams needing core HR, attendance & leave automation. | Growing companies needing full statutory payroll & approval workflow. | Established enterprises requiring dedicated instance & priority support. |
| **Employee Roster Limit** | Up to 25 Active Employees | Up to 100 Active Employees | Up to 300 Active Employees (custom expandable) |
| **Core HR & Scoped Directory** | Included | Included | Included |
| **Attendance & Leave Workflows** | Included | Included | Included |
| **Workforce Analytics & CSV Export** | Basic (Company totals) | Full (Department scoping & sanitization) | Full (Department scoping & custom exports) |
| **Philippine Statutory Payroll Engine** | *Optional Add-on* | Included (SSS, PhilHealth, Pag-IBIG, BIR tax) | Included (Full statutory engine & adjustments) |
| **DomPDF Payslip Generation** | Preview only | Included (Downloadable A4 PDF) | Included (Custom corporate branding) |
| **5-Stage Approval Workflow** | Not included | Included (Draft -> Locked) | Included (Optimistic concurrency locking) |
| **Security Audit Logging** | 30-day retention | 12-month retention | Unlimited retention / archival |
| **Deployment Model** | Managed Shared Host / VPS | Dedicated Single-Tenant VPS | Dedicated High-Availability VPS |
| **Technical Support Level** | Standard Email (Next business day) | Priority Email & Portal (Same-day business hours) | 24/7 Severity 1 Phone/Chat & Dedicated Slack |
| **One-Time Onboarding Fee** | **PHP 4,900** | **PHP 9,900** | **PHP 19,900** |
| **Monthly Subscription** | **PHP 2,490 / month** | **PHP 5,990 / month** | **PHP 11,990 / month** |
| **Annual Subscription (2 Months Free)** | **PHP 24,900 / year**<br>*(PHP 2,075 / mo equivalent)* | **PHP 59,900 / year**<br>*(PHP 4,992 / mo equivalent)* | **PHP 119,900 / year**<br>*(PHP 9,992 / mo equivalent)* |

---

## 3. Explicit Inclusions and Exclusions

### Features Explicitly Included
- Employee directory management with duplicate detection and inline status management.
- Web-based attendance clock-in and clock-out with `Asia/Manila` timezone normalization.
- Multi-category leave request tracking, overlap prevention, and manager review queue.
- Role-Based Access Control enforcing least privilege across 4 standardized roles.
- Statutory payroll calculation engine implementing SSS (2025 rates), PhilHealth (5.0%), Pag-IBIG (Circular 460), and BIR TRAIN tax tables.
- Official A4 employee payslip generation with itemized employer cost breakdown.
- Pre-flight onboarding verification command and comprehensive documentation.

### Features Explicitly Excluded (Awaiting Future Roadmap / Not Priced)
- **Direct Bank Disbursement**: No automatic integration with bank payment gateways (BDO, BPI, Metrobank). Payroll disbursements must be processed externally.
- **Direct Government Portal EDI Filing**: No automated electronic filing to SSS, PhilHealth, Pag-IBIG, or BIR online portals.
- **Automated Shift Scheduling & Tardiness Penalties**: Shift duration is tracked, but company-specific tardiness deduction formulas are not automated.

---

## 4. Cost Structure & Profitability Model (Per 10 Customers)

The following financial model demonstrates the commercial viability of the Managed Single-Tenant architecture:

### 4.1 Monthly Infrastructure & Operational Costs (10 Professional Clients)

| Expense Item | Calculation Basis | Monthly Cost (USD) | Monthly Cost (PHP @ 58.00) |
| :--- | :--- | :---: | :---: |
| **Cloud Compute (Linode/DigitalOcean)** | 10 dedicated 2 vCPU / 4GB RAM VPS instances @ $20/mo | $200.00 | PHP 11,600.00 |
| **Automated Backups & Storage** | S3 off-site encrypted snapshot storage | $15.00 | PHP 870.00 |
| **Domain & SSL Maintenance** | Multi-domain management & DNS routing | $10.00 | PHP 580.00 |
| **Part-Time Technical Support** | 20 hours/month customer support labor @ PHP 500/hr | — | PHP 10,000.00 |
| **Total Monthly Operating Cost (COGS)** | | **$225.00** | **PHP 23,050.00** |

### 4.2 Monthly Revenue & Gross Margin (10 Professional Clients)

- **Monthly Recurring Revenue (MRR)**: 10 clients × PHP 5,990.00 = **PHP 59,900.00**
- **Less Operating Cost (COGS)**: PHP 23,050.00
- **Monthly Gross Profit**: **PHP 36,850.00**
- **Gross Profit Margin**: **61.5%** (scales to >75% with 25+ customers as support labor amortizes).

### 4.3 Break-Even Analysis
- Fixed base overhead: ~PHP 15,000 / month.
- Break-Even Point: **3 active Professional Tier clients** or **6 Starter Tier clients**.

---

## 5. Pilot Program Pricing Terms

For participants in the Phase 9 / Phase 10 **Commercial Pilot Program**:
- **Setup & Onboarding**: **Waived 100%** (Value: PHP 9,900).
- **Subscription Fee**: **50% Discount** for the first 3 months of live evaluation:
  - Starter Tier: PHP 1,245 / month.
  - Professional Tier: PHP 2,995 / month.
- **Pilot Commitment**: Client agrees to provide bi-weekly feedback on payroll accuracy, attend a 30-minute monthly review session, and grant permission for an anonymized case study upon successful completion.

