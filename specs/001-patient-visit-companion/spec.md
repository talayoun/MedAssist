# Feature Specification: MedAssist — Patient Visit Companion System

**Feature Branch**: `001-patient-visit-companion`
**Created**: 2026-03-28
**Status**: Draft
**Input**: User description: "Build MedAssist — a browser-based patient companion system (PWA) that guides hospital patients through their entire visit, from home to the treatment room, without requiring them to download an app, create an account, or search for anything."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Magic Link Entry: Zero-Friction Patient Onboarding (Priority: P1)

A patient scheduled for a hospital procedure receives an SMS with a single link. Tapping it opens their personalized preparation page instantly in the browser — no app download, no account creation, no password. The link is tied to their phone number and appointment.

**Why this priority**: This is the entry gate to the entire system. Nothing else can be tested or delivered without it. It directly addresses App Fatigue and Password Fatigue — the two barriers that would prevent adoption in this population.

**Independent Test**: A test patient phone number can receive a Magic Link SMS and open a personalized checklist page in a mobile browser within 60 seconds, with no installation or login step.

**Acceptance Scenarios**:

1. **Given** a patient has an upcoming appointment in the system, **When** the scheduled send time arrives, **Then** they receive an SMS containing a unique, one-tap link to their visit page, with a short welcoming message.
2. **Given** a patient taps their Magic Link, **When** the link opens, **Then** they see their name, department name, and appointment date — no login screen, no search, no menu.
3. **Given** a patient taps an already-used Magic Link, **When** the link is opened again, **Then** the system redirects them to request a fresh link rather than showing an error code.
4. **Given** a patient taps their Magic Link after it has expired (72 hours for elective), **When** the link opens, **Then** they see a plain-language message explaining what happened and how to get help.
5. **Given** the Magic Link URL is inspected, **When** its content is examined, **Then** it contains no medical information, patient name, or procedure details in the URL itself.

---

### User Story 2 — Pre-Visit Preparation Checklist (Elective Track) (Priority: P2)

An elective patient receives their Magic Link before their visit and sees a checklist customized to their specific procedure: what to bring, fasting rules, medications to pause. They can complete items over multiple sessions — progress is saved even if they close the browser.

**Why this priority**: The checklist addresses the single biggest pre-visit anxiety driver — patients not knowing what to do. It also provides the hospital with a self-service preparation tool that reduces last-minute calls and no-shows.

**Independent Test**: A test patient for a specific procedure type can open their checklist, mark items complete across two separate browser sessions, and confirm items remain checked on re-opening.

**Acceptance Scenarios**:

1. **Given** a patient opens their Magic Link for an elective visit, **When** the page loads, **Then** they see a checklist specific to their procedure type (e.g., pre-op surgery vs. outpatient clinic).
2. **Given** a patient checks off a checklist item, **When** they close and reopen their browser, **Then** the checked item remains checked.
3. **Given** a checklist item has a time-sensitivity (e.g., fasting), **When** fewer than 24 hours remain before the visit and the item is unchecked, **Then** the item is visually highlighted to draw attention.
4. **Given** a patient has not opened their Magic Link within a configurable window before the visit, **When** that threshold is crossed, **Then** they receive exactly three reminder SMS — not multiple.
5. **Given** a patient has completed all checklist items, **When** they view the checklist, **Then** they see a clear completion confirmation and their next step.

---

### User Story 3 — Photo-Based Step-by-Step Navigation (Priority: P3)

On the day of their visit, a patient receives navigation guidance from the parking lot to their department. Each step shows a real landmark photo and a single short instruction. The patient taps "I'm here" to advance to the next step. They always know exactly where they are in the route.

**Why this priority**: Wayfinding failure is a high-stress, high-visibility problem. Patients who get lost arrive late and anxious, affecting both experience and clinical throughput. This feature eliminates that failure without requiring GPS infrastructure.

**Independent Test**: A test user can navigate a 5-step photo route from start to finish by tapping "I'm here" at each step, with the progress indicator updating correctly and the final step transitioning to the waiting screen.

**Acceptance Scenarios**:

1. **Given** a patient accesses navigation, **When** the screen loads, **Then** they see only the current landmark photo and a single short direction — never a full map or list of all steps.
2. **Given** a patient taps "I'm here" at a step, **When** confirmed, **Then** the next landmark photo and instruction appear.
3. **Given** a patient is mid-route, **When** they look at the progress indicator, **Then** it shows their current step number and total steps (e.g., "Step 3 of 6").
4. **Given** a patient reaches the final navigation step, **When** they tap "I'm here," **Then** they are automatically taken to the waiting screen.
5. **Given** a patient wants to go back, **When** they tap the back option, **Then** they return to the previous step.
6. **Given** a patient taps the parking navigation option, **When** tapped, **Then** the device's external map application opens with the hospital's parking location pre-set.

---

### User Story 4 — Waiting Screen: Resolving the "Black Hole" (Priority: P4)

Once a patient arrives at their department and confirms arrival, they see a waiting screen that confirms they are in the right queue, shows a staff-entered estimated wait time, and updates automatically. They never need to refresh or ask the desk if they've been forgotten.

**Why this priority**: This is the feature that addresses the primary emotional pain point — the feeling of being invisible while waiting. Even without EMR integration, a staff-entered estimate combined with a confirmation message transforms the patient experience. Identified as the top priority by the academic mentors.

**Independent Test**: A staff member can set an estimated wait time for a department, and a test patient's waiting screen displays that estimate and updates it within 60 seconds of the staff change, without the patient doing anything.

**Acceptance Scenarios**:

1. **Given** a patient taps "I've arrived at the department," **When** confirmed, **Then** the waiting screen opens showing a message that the team is aware of their arrival.
2. **Given** staff has entered an estimated wait time, **When** a patient views the waiting screen, **Then** they see the estimate in plain language (e.g., "About 20 minutes").
3. **Given** the estimated wait time has elapsed, **When** the patient is still waiting, **Then** the screen automatically updates to a patience message — never shows a zero or expired timer.
4. **Given** the waiting screen is open, **When** 60 seconds pass, **Then** the screen silently refreshes with the latest information — no manual action required from the patient.
5. **Given** a patient wants to contact the desk, **When** they tap "Contact the team," **Then** they can send a short pre-written message to the Back-Office.
6. **Given** a staff member sends a broadcast update, **When** all waiting patients' screens refresh, **Then** the update message is visible on every waiting patient's screen.

---

### User Story 5 — Digital Forms & Document Capture (Priority: P5)

A patient can complete admission forms, photograph their ID and insurance card, and add a digital signature — all from their phone, while waiting. The completed documents are available to staff as a PDF in the Back-Office.

**Why this priority**: This removes the reception desk queue bottleneck. Patients complete paperwork asynchronously during wait time rather than standing in line, reducing both patient frustration and staff workload at the desk.

**Independent Test**: A test patient can open a form, fill in fields, photograph a test ID card, add a digital signature, and submit — after which the staff Back-Office shows a downloadable PDF containing all submitted information.

**Acceptance Scenarios**:

1. **Given** a patient accesses their forms section, **When** they open a form, **Then** they can fill text fields, select options, and submit without visiting a desk.
2. **Given** a patient needs to upload an ID or insurance card, **When** they tap the capture option, **Then** they can take a photo directly with their phone camera.
3. **Given** a patient reaches a consent document, **When** they review it, **Then** they can apply a digital signature using touch input on screen.
4. **Given** a patient has submitted all forms, **When** a staff member opens their record in the Back-Office, **Then** a single export action produces a PDF with all submitted information and signatures.
5. **Given** a patient closes the browser mid-form, **When** they reopen their link and return to the form, **Then** previously entered data is preserved.

---

### User Story 6 — Emergency (ER) Track: Instant Onboarding (Priority: P6)

A patient who arrives at the emergency room without an appointment is registered by staff in seconds. They immediately receive a Magic Link on their phone that opens to a waiting screen — not a pre-visit checklist — and shows abbreviated consent forms to complete while waiting.

**Why this priority**: The ER track handles a fundamentally different situation: no preparation time, urgent context, high stress. The system must serve these patients without expecting any prior engagement. Without this, a significant patient population is excluded.

**Independent Test**: A staff member can enter a phone number in the Back-Office, send an ER Magic Link, and a test patient receives the SMS and opens a waiting screen (not a checklist) within 60 seconds. The ER link expires after 12 hours.

**Acceptance Scenarios**:

1. **Given** an unscheduled patient arrives at the ER, **When** a staff member enters their phone number and taps "Send Emergency Link," **Then** the patient receives an SMS within 60 seconds.
2. **Given** an ER patient opens their Magic Link, **When** the page loads, **Then** they see a waiting screen directly — not a preparation checklist.
3. **Given** an ER Magic Link has been active for 12 hours, **When** it is tapped, **Then** it shows an expiry message in plain language.
4. **Given** an ER patient is on the waiting screen, **When** staff adds a new clinical station (e.g., X-ray), **Then** the patient receives a notification with the name of their next destination.
5. **Given** an ER patient is waiting, **When** they access their forms section, **Then** they see abbreviated consent forms appropriate for their situation — not a full elective checklist.

---

### User Story 7 — Staff Back-Office: Queue Dashboard & Patient Management (Priority: P7)

A staff member (department manager or secretary) has a desktop browser dashboard showing all patients currently waiting in their department. They can update each patient's status in one tap, send a broadcast message to all waiting patients, add clinical stations to a patient's journey, and create ER Magic Links — without any specialized software.

**Why this priority**: The Back-Office is the operational spine of the system. Without it, staff cannot update patient status, send messages, or trigger ER onboarding. It enables everything the patient-facing side promises.

**Independent Test**: A staff test account can log in, see a patient list for their department, update one patient's status to "In treatment," and send a broadcast message — with all changes reflected on the patient-side within 60 seconds.

**Acceptance Scenarios**:

1. **Given** a staff member logs in, **When** the dashboard loads, **Then** they see all patients in their department with: name, arrival time, time waiting, and current status.
2. **Given** a staff member taps a patient's status button, **When** they select a new status, **Then** the change is immediately reflected in the dashboard and on the patient's screen.
3. **Given** a staff member types a message and taps "Send to All," **When** sent, **Then** all currently waiting patients in that department receive the update on their screens.
4. **Given** a staff member adds an unplanned clinical stop to a patient's journey, **When** added, **Then** the patient immediately receives a notification showing their next destination.
5. **Given** a staff member enters a phone number and taps "Send Emergency Link," **When** sent, **Then** the patient receives an ER Magic Link within 60 seconds.
6. **Given** a staff member exports a patient's record, **When** the export is triggered, **Then** a single PDF is produced containing all completed forms and signatures.

---

### User Story 8 — Admin: System Configuration & Content Management (Priority: P8)

An admin can manage staff accounts, upload and edit photo navigation routes for any department, create and edit procedure-specific checklist templates, and configure when Magic Links are sent to elective patients — all through the browser-based Back-Office, without writing any code.

**Why this priority**: Without admin capabilities, the system cannot be configured for a new hospital or department, navigation routes cannot be updated, and checklist templates cannot be created. This is the setup layer that makes everything else work.

**Independent Test**: An admin test account can create a new staff user, upload a 5-step navigation route with photos and instructions, create a new checklist template for a procedure type, and configure a Magic Link send rule — all without developer assistance.

**Acceptance Scenarios**:

1. **Given** an admin creates a new staff account, **When** that account logs in, **Then** it sees only the patients in its assigned department.
2. **Given** an admin uploads a new photo and direction text for a route step, **When** the change is saved, **Then** the next patient navigating that route sees the updated content.
3. **Given** an admin creates a new checklist template for a procedure type, **When** a patient with that procedure type opens their Magic Link, **Then** they see the template's items.
4. **Given** an admin configures a Magic Link send rule for a department, **When** a patient's appointment falls within that rule's window, **Then** they receive their Magic Link automatically at the configured time.
5. **Given** an admin reorders the steps in a navigation route, **When** the change is saved, **Then** the next patient navigating that route sees the steps in the updated order.

---

### User Story 9 — Companion: Shared Wait Status (Priority: P9)

A companion (family member or friend) receives a separate Magic Link — with the patient's consent — that shows them the same waiting status as the patient. This eliminates the need for the patient to relay updates while managing their own stress.

**Why this priority**: Companions are often as anxious as patients. Giving them their own view into the queue reduces burden on the patient and decreases calls to the nursing station. Lower priority because the core value is in the patient flow.

**Independent Test**: A staff member can issue a companion Magic Link to a second phone number. The companion's view shows the same waiting status as the patient and updates when staff changes the patient's status.

**Acceptance Scenarios**:

1. **Given** a patient consents to sharing their status, **When** a companion link is issued by staff, **Then** the companion receives an SMS with their own Magic Link.
2. **Given** a companion opens their Magic Link, **When** it loads, **Then** they see the patient's current waiting status and estimated wait time.
3. **Given** the patient's status is updated by staff, **When** the companion's screen refreshes, **Then** they see the updated status without any action on their part.

---

### Edge Cases

- What happens when a patient's phone has no internet connection mid-navigation? → Last-loaded step and checklist remain visible from cache; a plain-language Hebrew offline message is shown; no data is lost.
- What happens if a Magic Link SMS fails to deliver? → System retries up to 3 times with a 5-minute delay; staff can see delivery status in the Back-Office.
- What happens if a patient opens their Magic Link on a desktop browser? → A message instructs them to open the link on their phone; no patient functionality is available on desktop.
- What happens if a patient taps "I've arrived" at the wrong department? → The waiting screen shows the department name prominently so they can self-identify the error; "Contact the team" is always available.
- What happens if the estimated wait time is not set by staff? → The waiting screen shows the arrival confirmation without a time estimate — never shows zero or a placeholder.
- What happens if the per-visit notification limit (4) is already reached? → The system suppresses the send and logs it; staff can see that the limit was hit.
- What happens if two staff members update the same patient simultaneously? → Last write wins; the most recent status is displayed.

---

## Requirements *(mandatory)*

### Functional Requirements

**Magic Link & Authentication**

- **FR-001**: The system MUST send a Magic Link via SMS at a configurable time before the patient's scheduled visit, with timing rules configurable per department or procedure type by admin.
- **FR-002**: The system MUST send a Magic Link immediately when a staff member triggers emergency (ER) onboarding for an unscheduled patient.
- **FR-003**: Magic Links MUST be single-use per session; re-using an expired or already-opened link MUST redirect the patient to request a new one, with a plain-language explanation.
- **FR-004**: Elective Magic Links MUST expire 72 hours after sending; ER Magic Links MUST expire 12 hours after sending.
- **FR-005**: Magic Link URLs MUST NOT contain patient name, medical data, or procedure details in the URL itself.
- **FR-006**: Staff accounts MUST require username and password. Accounts MUST lock for 15 minutes after 5 consecutive failed login attempts. Staff sessions MUST expire after 60 minutes of inactivity.

**Patient — Preparation Checklist (Elective)**

- **FR-007**: The system MUST display a checklist customized to the patient's specific procedure type upon opening an elective Magic Link.
- **FR-008**: Checklist items MUST cover at minimum: items to bring, fasting instructions (if applicable to the procedure), and medications to pause or continue.
- **FR-009**: Checklist completion state MUST persist across browser sessions — checked items remain checked after the browser is closed and reopened.
- **FR-010**: Uncompleted checklist items within 24 hours of the visit MUST be distinctly highlighted to alert the patient.
- **FR-011**: If a patient has not opened their Magic Link within a configurable pre-visit window, the system MUST send exactly one reminder SMS — never a duplicate for the same event.

**Patient — Photo-Based Navigation**

- **FR-012**: The navigation interface MUST show exactly one landmark photo and one short direction instruction per screen — never a full route map or step list.
- **FR-013**: The patient MUST tap a confirmation action (e.g., "I'm here") to advance to the next navigation step.
- **FR-014**: A progress indicator MUST be visible at all times showing the current step number and total steps.
- **FR-015**: The final navigation step MUST automatically transition the patient to the waiting screen upon confirmation.
- **FR-016**: Navigation routes MUST cover at least 5 base routes for the MVP: Main Entrance, Central Parking, Emergency, Surgery, and Outpatient Clinics.
- **FR-017**: The patient MUST be able to open the device's external map application to the hospital parking location from the navigation screen.

**Patient — Waiting Screen**

- **FR-018**: The waiting screen MUST open automatically when a patient confirms arrival at their department.
- **FR-019**: The waiting screen MUST always display a confirmation that the team is aware of the patient's arrival.
- **FR-020**: The waiting screen MUST display the staff-entered estimated wait time when one has been set; when none is set, no time estimate is shown.
- **FR-021**: When the estimated wait time has elapsed and the patient is still waiting, the screen MUST automatically update to a patience message in plain language.
- **FR-022**: The waiting screen MUST silently refresh at least every 60 seconds without requiring patient action.
- **FR-023**: The patient MUST be able to send a short pre-written message to the Back-Office using a "Contact the team" button on the waiting screen.

**Patient — Digital Forms**

- **FR-024**: The system MUST allow patients to complete admission forms from their phone, including text input and selection fields.
- **FR-025**: The system MUST allow patients to photograph their ID and insurance card directly from their phone camera.
- **FR-026**: The system MUST support digital signature capture on consent documents using touch input.
- **FR-027**: Partially completed forms MUST be saved and restored when the patient closes and reopens their browser.
- **FR-028**: Staff MUST be able to export all completed forms and signatures for a patient as a single PDF from the Back-Office.

**Patient — ER Track**

- **FR-029**: Staff MUST be able to create an ER Magic Link by entering only the patient's phone number — no appointment data required.
- **FR-030**: ER Magic Links MUST open directly to the waiting screen — never to a preparation checklist.
- **FR-031**: ER patients MUST have access to abbreviated consent forms from the waiting screen.
- **FR-032**: Staff MUST be able to add clinical stations to an ER patient's journey in real time after initial onboarding.

**Offline Fallback**

- **FR-033**: When the patient loses internet connectivity, the last-loaded navigation step and checklist content MUST remain visible from local cache.
- **FR-034**: The offline state MUST be communicated with a plain-language Hebrew message: "אין חיבור - מציג מידע שמור."

**Notification Engine**

- **FR-035**: The system MUST send at most 4 SMS notifications per patient per visit; duplicate sends for the same event MUST be suppressed.
- **FR-036**: SMS delivery MUST be attempted within 60 seconds of the triggering event.
- **FR-037**: Failed SMS sends MUST be automatically retried up to 3 times with a 5-minute delay between each attempt.
- **FR-038**: When staff add a new clinical station to a patient's journey, the patient MUST receive a notification naming their next destination.

**Staff — Back-Office**

- **FR-039**: The Back-Office MUST display all current patients in the staff member's department with: patient name, arrival time, time-in-queue, and current status.
- **FR-040**: Staff MUST be able to update any patient's status (Waiting / In Treatment / Done) in a single tap.
- **FR-041**: Staff MUST be able to send a free-text broadcast message to all currently waiting patients in their department in a single action.
- **FR-042**: Staff MUST be able to add a clinical station to a patient's journey by selecting from a predefined list of departments.
- **FR-043**: Staff MUST be able to reorder pending clinical stations for a patient via drag-and-drop or up/down controls.
- **FR-044**: Staff MUST be able to manually mark a clinical station as complete if the patient has not self-confirmed.
- **FR-045**: Staff MUST be able to export a patient's completed forms and signed documents as a PDF.
- **FR-046**: The Back-Office MUST be accessible from a standard desktop browser with no additional software installation required.

**Admin**

- **FR-047**: Admins MUST be able to create, edit, and deactivate staff user accounts and assign them to departments.
- **FR-048**: Admins MUST be able to upload photos and direction text for each step of a navigation route, and reorder steps, without writing code.
- **FR-049**: Admins MUST be able to create and edit procedure-specific checklist templates, including adding, removing, and reordering items.
- **FR-050**: Admins MUST be able to configure Magic Link send timing rules per department and/or procedure type.

**Accessibility & Language**

- **FR-051**: All patient-facing text MUST be in Hebrew with full right-to-left layout.
- **FR-052**: Minimum font size across all patient-facing screens MUST be 16pt.
- **FR-053**: All interactive tap targets on patient-facing screens MUST be at least 44×44 pixels.
- **FR-054**: All patient-facing status and error messages MUST explain what happened and what to do next — no error codes.

---

### Key Entities

- **Patient**: A person with a hospital visit. Identified by phone number. Attributes: name, visit date, procedure name. No clinical data stored.
- **Appointment**: A scheduled or emergency visit linking a Patient to a Department. Holds procedure type, visit status, and Magic Link metadata (send time, expiry, open status, track type).
- **MagicLink**: A unique, time-limited, one-time-use entry URL tied to an Appointment. Carries track type (elective/ER), expiry duration, and usage state.
- **Department**: A hospital department or ward. Belongs to a hospital. Has an associated navigation route, waiting queue, and staff members.
- **NavigationRoute**: An ordered sequence of steps guiding a patient from a named entry point to a department.
- **RouteStep**: One step in a NavigationRoute: a landmark photo and a short direction instruction, with an order index.
- **WaitingQueue**: The real-time state of a department's queue: all currently waiting patients, arrival times, estimated wait, and statuses.
- **PatientStation**: One clinical stop in a patient's visit journey (e.g., X-ray, pharmacy). Has order, status (pending/complete), completion timestamp, and who completed it.
- **Notification**: A record of every SMS sent to a patient: type, timestamp, delivery status, retry count, and triggering event.
- **StaffUser**: A hospital staff member with a role (Staff or Admin), assigned department, and login credentials.
- **ChecklistTemplate**: A procedure-specific ordered list of preparation items, managed by admins, assigned to patients based on their procedure type.
- **DigitalForm**: A patient-completed admission or consent form with field data, captured images, and digital signatures. Exportable as PDF.
- **Companion**: A secondary Magic Link recipient with read-only access to a patient's waiting status, linked with patient consent.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A patient can tap their Magic Link and reach their personalized checklist or waiting screen in at most 3 taps, with no account creation or login step required.
- **SC-002**: 100% of SMS notifications are delivered (or retried up to 3 times) within 60 seconds of the triggering event.
- **SC-003**: The system supports 1,000 or more concurrent users (patients and staff combined) without degradation of the waiting screen refresh cycle or navigation display.
- **SC-004**: A staff member can update a patient's status, send a broadcast to all waiting patients, or create an ER Magic Link in a single action from the Back-Office dashboard.
- **SC-005**: Zero patient data beyond name, visit date, and procedure name is stored on MedAssist servers — verifiable by data audit.
- **SC-006**: When a patient loses internet connectivity, the last-loaded navigation step and checklist content remain visible on screen — no blank page or crash.
- **SC-007**: A patient can complete admission forms, photograph supporting documents, and digitally sign a consent document entirely from their phone — without visiting a reception desk.
- **SC-008**: Staff broadcast messages appear on all waiting patients' screens within 60 seconds of being sent.
- **SC-009**: An admin can configure a new department's navigation route, checklist template, and Magic Link timing rule without writing code or requiring developer involvement.
- **SC-010**: The elective checklist completion rate serves as a measurable proxy for patient preparation — baseline to be established in pilot; target improvement defined post-launch.

---

## Assumptions

- Patients have a smartphone with a modern mobile browser and can receive SMS to the phone number registered at appointment booking.
- Patient data (name, phone number, procedure type, appointment date) is entered into MedAssist manually or via batch file by hospital staff — no EMR integration exists in v1.0.
- Navigation route photos are taken and uploaded by admin staff; MedAssist does not generate or source them automatically.
- All patient-facing content is in Hebrew for v1.0; English support exists for staff and admin interfaces.
- The system does not replace any clinical decision-making or medical record system — it is a coordination and communication layer only.
- Digital signatures collected by MedAssist are used for operational forms (admission, consent) and exported as PDF for the hospital's own record-keeping; the legal validity of digital signatures is governed by the hospital's existing policies, not MedAssist.
- Staff access the Back-Office exclusively on desktop browsers; no mobile Back-Office version is required for v1.0.
- The Companion feature requires patient consent, confirmed verbally and initiated by staff issuing the companion link; no in-app patient consent workflow is required for v1.0.
- Push Notifications (Web Push API) are a Should-Have enhancement; the MVP operates on SMS only. Patients must have the browser tab open to see waiting screen auto-updates without a push trigger.
- All data is stored on servers in Israel or the EU, in compliance with the Israeli Privacy Protection Law (2011 amendment) and GDPR.
- The maximum photo size per navigation step is 200 KB (compressed on upload); this is sufficient for landmark-quality images at mobile screen resolution.
