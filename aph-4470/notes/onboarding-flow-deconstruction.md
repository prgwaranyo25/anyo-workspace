# Expert Onboarding Flow Deconstruction

## anyoexpertportal — Frontend Flow

### Phase 1: Account Creation (3 screens)
1. **Basic Info** — firstName, lastName, title, mobileNumber, gender
2. **Verification** — OTP for email + WhatsApp
3. **Profile Picture** — S3 upload

### Phase 2: Configure Account (activity-based, 14 steps max)
Order: Activity → [role-specific forms] → Resume → Bank Details → Contract → [Location + Availability for THERAPIST] → Thank You

| Form | Applicable To | Key Fields |
|------|--------------|------------|
| ActivityForm | All | activities: [THERAPIST, CIRCLE_EXPERT, MANAGE_EVENT, LISTENER] |
| ExpertProfileCreationForm | THERAPIST | tagLine, yearsOfExperience, pricing(min/max), languages[], qualifications[] |
| ChooseSpecialization | THERAPIST | verticals[], concerns[] (conditional on vertical) |
| ExpertiseRating | THERAPIST | expertLevelId per (vertical, concern) combo |
| ExpertStartingDate | THERAPIST | isImmediate, startDate (conditional) |
| ListenerForm | LISTENER | listenerName, listenerAvatar |
| EventsProfileForm | MANAGE_EVENT | userSelected[], userSuggested |
| CircleProfileForm | CIRCLE_EXPERT | selectedUserInterest[] |
| UploadResumeForm | All | resumeUrl (PDF, max 10MB) |
| BankDetailsForm | All | accountHolderName, accountNo, ifscCode, bankingName |
| ContractForm | All | Display only, sets status=UNDER_REVIEW |
| LocationPreferenceForm | THERAPIST | isOfflineConsultation, city, address (conditional) |
| ExpertAvailabilityForm | THERAPIST | day[], slots[]{slotStart, slotEnd, online, offline} |

### Missing Fields (new requirements)
- **Residential Address** — not in any form; needs to be added (likely near Basic Info or Bank Details)
- **Testimonials** — not in any form; needs new step or addition to Expert Profile form
- **Preferred Workshop Domain** — not in EventsProfileForm; needs addition conditional on MANAGE_EVENT selection

### State Management
- Zustand store: `AuthOnboardingStore`
- Main model: `ExpertOnboardRequests` (upserted on every step)
- API: `POST /createOrUpdateOnboardingCollection`

### UX Pain Points Found
1. `UploadResumeForm` uses `document.getElementById()` for error — should be React state
2. No breadcrumb showing progress through phases
3. No progress indicator during S3 file uploads
4. Bank details: no error if Razorpay IFSC lookup fails
5. Activity deselection has no confirmation (would lose data)
6. Contract step has no explicit acceptance checkbox
7. Mobile number: only length check, no format validation
8. Tagline: placeholder says 200 chars but no actual maxLength enforced
9. Pricing: two separate selects instead of a range control
10. Availability: visually confusing nested structure

---

## anyobackendapi — Backend Flow

### Expert Onboarding Model (`expertOnboardRequests` collection)
All current fields: firstName, lastName, title, email, mobile, gender, profilePic, activities[], tagLine, pricing[], yearsOfExperience, qualifications[], description, languages[], specialization[], availability[], startDate, userInterest[], listener, eventsCategories, resumeUrl, contractUrl, onboardingStatus, comments[], location, bankDetails

**Missing for new requirements:**
- `residentialAddress` — not in model
- `testimonials` — not in model
- `preferredWorkshopDomain` — not in model (only `eventsCategories` exists)

### Status Workflow
```
PENDING → UNDER_REVIEW → APPROVED (creates IAnyoTherapist)
                       → REQUIRE_CHANGES → expert resubmits → UNDER_REVIEW
                       → REJECTED (terminal)
```

### Key Endpoints
- `POST /createOrUpdateOnboardingCollection` — expert upserts form
- `POST /admin/expert-onboarding/grid` — admin list view
- `GET /admin/expert-onboarding/get/:id` — admin detail view
- `POST /admin/expert/onboard/status/:id` — approve/reject/require-changes
- `POST /admin/expert/onboard/comments/:id` — add comment
- `POST /admin/experts/add` — create therapist profile on approval (64-field payload)

### Notifications
- WhatsApp: ANW0023 (submitted), ANW0024 (changes needed), ANW0025 (resubmitted), ANW0026 (approved), ANW0027 (welcome), ANW0028 (rejected)
- Discord: New application + resubmission alerts to OpsPortal channel

---

## anyo-portal — Admin Approval Flow

### Pages
- `/experts/onboarding` — 5-tab list (Under Review, Required Changes, Approved, Rejected, Pending)
- `/experts/form/:id` — 11-step wizard view of expert's application
- `/experts/add/req/:onboardid` — finalize expert profile creation

### Admin Actions
| Action | Status Required | Notes |
|--------|----------------|-------|
| Approve | UNDER_REVIEW, REQUIRE_CHANGES | Navigates to /experts/add to create profile |
| Reject | UNDER_REVIEW, REQUIRE_CHANGES | No rejection reason captured |
| Request Changes | UNDER_REVIEW | No structured "what to fix" field |
| Add Comment | Any | Free text; threaded with timestamp + author |
| Download Resume | Any | PDF download only from step 11 of wizard |
| Download Profile Pic | Any | Separate button |

### Table Columns Shown
Name, Email, Applied On, Start Date, Last Updated (by whom), Activities (color tags), Status, Action (View button)

### UX Gaps in Admin Pipeline
1. **No rejection reason field** — rejection has no structured reason capture
2. **No bulk actions** — must review/act on one expert at a time
3. **Resume not accessible from list** — must navigate into 11-step wizard to get to step 11
4. **No role-specific review checklist** — same form for all expert types
5. **Comment requires navigating away** — can't add comments and change status atomically
6. **No audit trail** — only lastModifiedAt/By tracked; no full action history
7. **No template reasons for REQUIRE_CHANGES** — admin must type free-form feedback
8. **Limited table info** — specialization, languages, pricing not shown in list
9. **REQUIRE_CHANGES has no structured spec** — admin can't mark exactly which fields need changes
10. **Wizard requires scrolling through all 11 steps** to review

---

## Summary: Fields to Add

| Field | Form Location | Conditional? | Backend | Notes |
|-------|--------------|--------------|---------|-------|
| Residential Address | New step or in Basic Info | No | Add to ExpertOnboardingRequests model | Simple text/address input |
| Testimonials | Expert Profile form or standalone step | No | Add to model | With tooltip text |
| Preferred Workshop Domain | EventsProfileForm | Yes — only if MANAGE_EVENT | Add to model (extend eventsCategories?) | Domain specialization for workshops |
