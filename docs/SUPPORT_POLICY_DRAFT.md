# Smart HR — Customer Support Policy (Draft)

## 1. Overview & Support Philosophy

This Customer Support Policy defines the support tiers, severity classifications, proposed service level targets, troubleshooting workflows, and escalation procedures for enterprise customers using Smart HR.

> [!NOTE]
> **Proposed Service Targets**: The response and resolution times described in this document represent proposed operational targets for commercial pilot evaluation and standard service level agreements (SLAs). They do not constitute unilateral legal warranties unless formalized in an executed Master Services Agreement.

---

## 2. Support Channels & Hours of Operation

- **Standard Support Hours**: Monday through Friday, **08:00 to 18:00 Asia/Manila (`UTC+08:00`)**, excluding Philippine regular national holidays.
- **Critical (Severity 1) Support**: Available **24/7/365** for contracted Professional and Enterprise clients during active payroll cut-off dates (10th–15th and 25th–end-of-month).
- **Communication Channels**:
  - **Email**: `support@smarthr.example.com`
  - **Client Portal**: `https://support.smarthr.example.com`
  - **Emergency Hotline / Priority Chat**: Provided to authorized Enterprise liaisons.

---

## 3. Incident Severity Levels & Proposed Target SLAs

| Severity Level | Definition | Example Scenarios | Proposed Initial Response | Proposed Target Resolution |
| :--- | :--- | :--- | :---: | :---: |
| **Severity 1 (Critical)** | Entire system unavailable, fatal database corruption, or complete blockage of an imminent statutory payroll run. | • Server unreachable (`HTTP 500/502/503`) across all users.<br>• Payroll calculation crashing for all employees on cut-off date.<br>• Widespread database lock preventing logins. | **< 1 hour**<br>(24/7) | **< 4 hours** (workaround)<br>**< 12 hours** (permanent fix) |
| **Severity 2 (High)** | A major business workflow is impaired for multiple users with no immediate workaround. | • Attendance clock-in failing for an entire department.<br>• Leave review queue failing to record approvals.<br>• PDF payslip generation failing across all requests. | **< 2 hours**<br>(Business hours) | **< 8 hours** (workaround)<br>**< 24 hours** (permanent fix) |
| **Severity 3 (Medium)** | Non-critical feature malfunction; business operations can continue using an identified workaround. | • CSV export failing for date ranges exceeding 90 days.<br>• Single employee unable to clock in (HR can manually note time).<br>• Minor discrepancy in non-statutory allowance display. | **< 8 hours**<br>(Business hours) | **< 3 business days** |
| **Severity 4 (Low)** | Minor cosmetic defect, documentation clarification, or general configuration request. | • Typos or formatting misalignments in UI labels.<br>• Request for assistance adding new department.<br>• General inquiry regarding future roadmap features. | **< 24 hours**<br>(Business hours) | Scheduled in next maintenance release |

---

## 4. Support Escalation Ladder

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Support Escalation Ladder                       │
│                                                                        │
│   [Tier 1: Customer Success Helpdesk]                                  │
│     • User account unlocking & password resets                         │
│     • Guidance on form usage & navigation                              │
│     • Triaging & severity assignment                                   │
│                        │ (Escalate if unresolved within 30 min)        │
│                        ▼                                               │
│   [Tier 2: Technical Application Support]                              │
│     • Log inspection & error analysis                                  │
│     • Statutory calculation verification                               │
│     • Configuration adjustments & data remediation                     │
│                        │ (Escalate if code defect or outage)           │
│                        ▼                                               │
│   [Tier 3: Core Engineering & DevOps Lead]                             │
│     • Emergency hotfix deployment                                      │
│     • Database transaction recovery                                    │
│     • Server infrastructure & network triage                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Standard Support Ticket Submission Template

When submitting an issue to `support@smarthr.example.com`, client administrators should provide the following information:

```markdown
SMART HR SUPPORT REQUEST TICKET

1. Organization Details:
   - Company Name: [e.g. Acme Solutions Philippines, Inc.]
   - Submitter Name & Role: [e.g. Maria Santos, HR Director]
   - Submitter Contact: [Email / Mobile]

2. Issue Description:
   - Severity Level Claimed: [Severity 1 / 2 / 3 / 4]
   - Affected Module: [Employees / Attendance / Leave / Reports / Payroll / Auth]
   - Summary of Issue: [Brief 1-sentence description]

3. Steps to Reproduce:
   1. Sign in as [Role / User]
   2. Navigate to [URL / Screen]
   3. Click on [Button / Field] and enter [Value]
   4. Observe error [Exact message on screen]

4. Expected vs. Actual Behavior:
   - Expected: [What should have happened]
   - Actual: [What actually happened]

5. Environment & Context:
   - Date and Time Observed: [YYYY-MM-DD HH:MM Asia/Manila]
   - Affected User(s): [All users / Specific Employee ID]
   - Browser & OS: [e.g. Chrome 124 on Windows 11 / Safari on macOS]
   - Screenshots / Error Text: [Attach relevant screenshots without exposing confidential passwords]
```

---

## 6. Post-Mortem Incident Report Template (For Sev 1 Incidents)

Following any Severity 1 incident, Smart HR engineering provides a formal Root Cause Analysis (RCA) within 3 business days:

```markdown
SMART HR POST-MORTEM INCIDENT REPORT

Incident ID: INC-2026-XXXX
Date of Incident: YYYY-MM-DD
Duration of Outage: [Hours : Minutes]
Impact Assessment: [Number of affected users, impacted payroll cycles]

1. Incident Summary:
   [High-level overview of what occurred]

2. Root Cause:
   [Detailed technical analysis of the underlying failure]

3. Remediation Actions Taken:
   [Immediate steps executed to restore service and verify data integrity]

4. Corrective & Preventative Measures:
   - Action Item 1: [e.g. Added automated regression test for edge-case statutory calculation]
   - Action Item 2: [e.g. Adjusted database pool connection timeout]
   - Action Item 3: [e.g. Updated deployment runbook to include pre-flight check]
```

