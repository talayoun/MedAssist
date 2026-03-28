# MedAssist Constitution

## Core Principles

### I. PWA & Zero-Installation (NON-NEGOTIABLE)
MedAssist is a Progressive Web App (PWA) accessible directly from the browser — no app store, no installation, no account creation. The Magic Link sent via SMS is the sole entry point for patients. This is not a technical choice; it is the only way to reach this population. Any feature that requires a native app install, app store presence, or account registration for patients violates this principle.

### II. Zero-Search UX
The interface always presents the patient's next relevant action — never a menu, never a search field. Information is structured chronologically along the patient's journey, not by category. Every primary action must be reachable in at most 3 taps from the entry point. Cognitive load must be minimized at every screen: plain human language (no medical jargon), minimum 16pt font, minimum 44×44px tap targets, full RTL Hebrew layout.

### III. Dual-Track Architecture
All features must account for two intake tracks that share the same navigation and waiting infrastructure but differ in entry point and content:
- **Elective track**: Magic Link sent some time before the visit; full pre-visit checklist and preparation flow.
- **Emergency (ER) track**: Magic Link created and sent at moment of arrival; no pre-preparation; Magic Link TTL is 12 hours; immediate waiting screen with abbreviated consent forms.

Features that apply to only one track must be clearly scoped. The underlying notification engine, visual navigation engine, and waiting-screen module are shared across both tracks.

### IV. Security & Privacy by Default
- All client–server communication over HTTPS / TLS 1.3.
- Magic Links are one-time-use, encrypted, contain no medical data in the URL, and expire after 72 hours (elective) or 12 hours (ER).
- Staff passwords hashed (minimum bcrypt or equivalent, 12+ characters). Account locked after 5 failed attempts for 15 minutes. Session timeout after 60 minutes of inactivity.
- Only name, date, and procedure name are stored on MedAssist servers — no clinical medical data.
- All data stored exclusively in Israel or Europe.
- Compliance with Israeli Privacy Protection Law (2011 amendment) and GDPR.
- Patient data deleted within 90 days of visit end upon request.

### V. Role-Based Access Boundaries
Four roles exist; each has a hard boundary enforced at the API level:
| Role | Interface | Scope |
|---|---|---|
| Patient | Mobile PWA via Magic Link | Own visit only |
| Companion | Mobile PWA via separate Magic Link | Same visit as patient (with consent) |
| Staff (dept. manager / secretary) | Back-Office (Desktop-First, browser) | All patients in own department |
| Admin | Back-Office (full access) | All departments, staff users |

No role may access data or perform actions beyond its defined boundary. Patients may never edit clinical visit data.

### VI. Offline Fallback
When the device has no internet connection, the last-loaded navigation instructions and checklist must remain visible from local cache. A clear non-technical message must be shown: "אין חיבור - מציג מידע שמור". Full offline functionality is out of scope for v1.0; the fallback is read-only cached content only.

### VII. Notification Discipline
The notification engine must never overwhelm patients. Hard rules:
- Maximum 4 notifications per event, in the patient's visit.
- No duplicate notifications for the same event.
- Automatic retry on failure: up to 3 attempts, 5-minute delay between retries.
- SMS must be delivered within 60 seconds of the triggering event.
- Push Notifications (Web Push API) are a Should-Have enhancement over SMS-only MVP.

## Technical Constraints

### Platform & Browser Support
- **Patient interface**: Mobile-First only. No desktop version.
  - Chrome 90+, Safari 14+ (iOS 14+), Firefox 88+, Samsung Internet 14+
- **Back-Office (Staff/Admin)**: Desktop-First. No mobile version.
- No native app; no Google Play or App Store presence.

### Performance Requirements
- Support 1,000+ concurrent users.
- Waiting screen auto-refreshes every 60 seconds.
- Navigation images: max 200 KB per image (auto-compressed on upload).

### Database (Logical Model — v1.0 MVP)
Core tables: `Patients`, `Appointments`, `Departments`, `NavigationRoutes`, `RouteSteps`, `WaitingQueue`, `PatientStations`, `Notifications`, `StaffUsers`, `ChecklistTemplates`.
Key relationships: Patients → Appointments → Departments → NavigationRoutes → RouteSteps. Physical implementation defined at build time.

### No EMR Integration in v1.0
There is no direct integration with hospital HIS/EMR systems (e.g., Hadassah Digital, Clalit). Patient data is exported as PDF and handed off to the secretariat. This is an explicit Out of Scope item; do not design features that assume EMR connectivity.

## MVP Scope & Feature Prioritization

### Must-Have (product does not function without these)
1. Automatic Magic Link delivery via SMS
2. Procedure-specific personal Checklist
3. Digital forms + digital signature + PDF export
4. Photo-based visual navigation (5 base routes)
5. Waiting screen ("black hole" solution)
6. Back-Office: queue management + broadcast message to waiting patients
7. Automatic notification engine (4 notifications per event)

### Should-Have (significant product improvement)
- Web Push Notifications (in addition to SMS)
- WhatsApp delivery via Business API
- Extended navigation (10 routes)
- Offline fallback for navigation and checklist

### Nice-to-Have (future versions only)
- Bidirectional EMR/HIS integration (HL7/FHIR)
- Real-time family member updates

### Explicit Out of Scope (v1.0)
Indoor GPS navigation, desktop patient interface, languages beyond Hebrew and English, payments/billing, medical records/test results/medication management, live chat with staff, AR navigation, appointment cancellation/rescheduling, post-visit follow-up, full offline mode.

## Development Governance

- This constitution supersedes any conflicting decision in specs, plans, or tasks.
- Every spec, plan, and task must be checked for compliance with the principles above before implementation begins.
- Any change to Must-Have scope, security boundaries, or role permissions requires an explicit amendment to this constitution with a documented rationale.
- Amendments require team consensus and must update the version and amendment date below.
- The Zero-Search principle and Zero-Installation principle are non-negotiable for v1.0; no exception without a constitution amendment.

**Version**: 1.0 | **Ratified**: 2026-03-28 | **Last Amended**: 2026-03-28
