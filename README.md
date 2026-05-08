# MedAssist 🏥

A Progressive Web App that guides patients through hospital visits, starting
whenever preparation needs to begin, not just when the appointment is close.
No app to download, no account, no password.

---

## The Problem

Going to a hospital appointment is stressful. Patients arrive late because they
couldn't find the department. They miss pre-visit prep because no one explained
it clearly. They sit in a waiting room with no idea how long they'll wait or
whether anyone knows they're there. And they fill out the same paper forms
they've filled out a dozen times before.

This is the everyday reality of outpatient care.

---

## Our Solution

MedAssist is a browser-based patient companion that guides people through their
entire hospital visit through a single SMS link.

No app to download. No account to create. No password to remember.

---

## The Philosophy

Hospitals are stressful not just because of what happens inside them, but
because of everything around it: not knowing where to go, not knowing if
you're in the right place, not knowing whether anyone has noticed you've
been sitting there for an hour.

MedAssist is designed to close those gaps. Every feature maps to a specific
moment where a patient loses their footing: the week before the procedure when
they're not sure what they're allowed to eat, the parking lot on the day of the
visit, the chair outside the treatment room where time stops making sense.
The system doesn't wait for patients to ask. It shows up before they need to.

The result isn't just a smoother visit. It's a patient who arrives calm,
prepared, and with the feeling that someone, somewhere, has thought this
through on their behalf.

---

## How It Works

### 👤 For Patients

A patient scheduled for a procedure receives an SMS as soon as preparation
needs to begin. For a routine visit, that might be 24 hours out. For a
procedure that requires a specific diet or medication change, it could be days
or weeks in advance. The timing is set per procedure, based on the earliest
preparation requirement.

One tap opens a private, step-by-step experience:

1. **Prepare**: A procedure-specific checklist tells them exactly what to bring,
   which medications to pause, and what to expect. Items are flagged as urgent
   in the 24 hours before the visit.
2. **Navigate**: On the day of the appointment, photo-based navigation guides
   them from the parking lot to the correct department, one real landmark photo
   and one short instruction per screen.
3. **Wait with visibility**: After arriving, patients confirm their presence and
   immediately see their queue status: estimated wait time, live staff updates,
   and broadcast messages, auto-refreshing every 60 seconds.
4. **Complete forms digitally**: While waiting, patients fill in admission forms,
   photograph their ID and insurance card, and sign consent documents, all on
   their phone, before they reach the reception desk.

For unscheduled emergency patients, staff generate an instant link that skips
directly to the waiting screen.

### 🖥️ For Hospital Staff

Staff access a desktop dashboard to:

- View a live queue of all patients in their department with real-time phase and
  status information
- Update patient status in one tap (waiting, in treatment, done)
- Broadcast a message to all waiting patients at once
- Generate emergency links for unscheduled arrivals
- View uploaded patient documents and export a single consolidated PDF
- Add clinical stations (X-ray, pharmacy, etc.) that appear on the patient's screen

### ⚙️ For Administrators

Configuration through the back-office, no code required:

- Upload navigation route photos and instructions per department
- Create and edit procedure-specific pre-visit checklists
- Manage digital form templates (patient uploads and staff consent PDFs)
- Control staff accounts and department access
- Configure SMS timing per procedure, based on how far in advance preparation begins

---

## Key Features

| Feature | What it solves |
|---------|----------------|
| SMS Magic Link | No app, no account, no password. Sent as early as the procedure requires, so patients have time to actually prepare. |
| Dual patient track | Full pre-visit flow for elective appointments; instant fast-track for ER patients |
| Photo-guided navigation | Real landmark photos, one step at a time, from arrival to department |
| Live waiting screen | Real-time queue status and broadcast messages so patients know they haven't been forgotten |
| Digital forms | Camera capture, digital signatures, and PDF export eliminate paper at reception |
| Offline support | Last-loaded checklist and navigation remain accessible with no internet connection |
| Hebrew RTL | Right-to-left Hebrew interface built in from the start, not added later |
| Role-based access | Patient, Staff, and Admin roles with API-enforced boundaries |

---

## Technology

MedAssist is a TypeScript monorepo with three applications sharing a validated type layer.

**Patient PWA** - React 18 + Vite, mobile-first Hebrew RTL, Progressive Web App
(offline-capable via Workbox service worker, installable without an app store)

**Staff & Admin Back-Office** - React 18 + Vite, desktop-first, role-gated pages

**API** - Node.js 20 + Express 4, PostgreSQL, Redis + BullMQ for the notification
queue, AWS S3 for navigation images and PDF exports, Twilio for SMS delivery,
pdf-lib + Sharp for server-side document generation

**Security** - One-time-use JWT magic links (no medical data in URLs), bcrypt staff
passwords, parameterized SQL, Helmet headers, CORS, presigned S3 URLs

**Testing** - Playwright for API contract tests and end-to-end browser tests;
Vitest for pure unit tests

---

## Status

MVP feature-complete. Developed as part of an entrepreneurship program.
All seven core workflows are implemented and tested end-to-end.

---

## Guiding Principles

1. **Zero-installation** - PWA only. No app store. No friction at entry.
2. **Zero-search UX** - Every primary action reachable in three taps or fewer.
3. **Dual track** - Elective (full pre-visit prep) and emergency (immediate access)
   on shared infrastructure.
4. **Privacy by design** - No clinical or sensitive data on MedAssist servers.
   Name, visit date, and procedure type only. Full compliance with Israeli
   Privacy Protection Law and GDPR.
5. **Notification discipline** - Maximum four SMS notifications per visit.
   No duplicates. No spam.
6. **Offline resilience** - Last-loaded content cached and readable without network.