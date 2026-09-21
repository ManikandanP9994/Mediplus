# Medi+ Wellness — Complete Appointment Module

React + TypeScript + Tailwind CSS website with a FastAPI + PostgreSQL + Redis appointment system.

## Included

- Responsive Medi+ website
- Right-bottom AI chatbot UI
- Doctor selection
- Date selection
- Fixed 10-minute appointment slots
- Daily slot generation
- Doctor working hours: 09:00–17:00
- Default break: 13:00–14:00
- PostgreSQL permanent appointment storage
- Redis distributed slot lock
- PostgreSQL row-level slot lock
- Unique constraints to prevent double booking
- Idempotency-Key protection against duplicate submissions
- Daily admin appointment list
- Asia/Kolkata timezone configuration
- API health endpoint

## Project structure

```text
medi-plus-website/
├── src/
│   ├── main.tsx
│   └── styles.css
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── services.py
│   │   ├── db.py
│   │   └── config.py
│   ├── sql/schema.sql
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Quick start — Docker

From the project root:

```powershell
docker compose up -d --build
```

Check:

```powershell
docker compose ps
```

Backend:

```text
http://localhost:8000
```

Swagger:

```text
http://localhost:8000/docs
```

Health:

```text
http://localhost:8000/api/health
```

Frontend can run separately:

```powershell
npm install
npm run dev
```

Create `.env.local`:

```env
VITE_API_URL=http://localhost:8000
VITE_CHAT_API_URL=http://localhost:8000/api/chat
```

Configure the Hospital RAG endpoint in the project root `.env` file. The URL and API key stay on the backend and are never exposed to the browser:

```env
HOSPITAL_RAG_URL=https://your-hospital-rag.example.com/chat
HOSPITAL_RAG_API_KEY=your-server-side-key
HOSPITAL_RAG_TIMEOUT_SECONDS=30
```

Restart the backend after changing these values:

```powershell
docker compose up -d --build
```

Then open:

```text
http://localhost:5173
```

## Local backend without Docker

Start PostgreSQL and Redis first.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Appointment rules

Each doctor gets 10-minute slots. The default schedule is:

```text
09:00–13:00
14:00–17:00
```

The slot generator skips the break automatically.

Examples:

```text
09:00–09:10
09:10–09:20
09:20–09:30
...
12:50–13:00

14:00–14:10
14:10–14:20
...
16:50–17:00
```

Change a doctor's `start_time`, `end_time`, `break_start`, `break_end`, and `slot_minutes` in PostgreSQL for custom schedules.

## Booking flow

```text
React
  ↓
GET /api/doctors
  ↓
GET /api/doctors/{doctor_id}/slots?date=YYYY-MM-DD
  ↓
Patient selects a slot
  ↓
POST /api/appointments
  ↓
Redis distributed lock
  ↓
PostgreSQL SELECT ... FOR UPDATE
  ↓
Check AVAILABLE
  ↓
Create patient
  ↓
Create appointment
  ↓
Mark slot BOOKED
  ↓
Unique DB constraints
  ↓
Return booking reference
```

## API

### Doctors

```http
GET /api/doctors
```

### Slots

```http
GET /api/doctors/1/slots?date=2026-09-20
```

### Generate a day

```http
POST /api/admin/generate-slots?target_date=2026-09-21
```

### Book

```http
POST /api/appointments
Idempotency-Key: unique-client-request-id
Content-Type: application/json
```

Body:

```json
{
  "doctor_id": 1,
  "slot_id": 12,
  "appointment_date": "2026-09-20",
  "patient_name": "Patient Name",
  "patient_phone": "+919999999999",
  "patient_email": "patient@example.com"
}
```

### Daily admin appointments

```http
GET /api/admin/appointments?date=2026-09-20
```

## Important production security

The `/api/admin/*` endpoints are intentionally simple demo endpoints so the project can be run immediately. Before production, protect them with authentication and role-based authorization.

Also add:

- HTTPS
- JWT/OIDC authentication
- Audit logging
- Rate limiting
- CSRF protection where applicable
- Patient-data encryption and access controls
- Database backups
- Secret management
- Monitoring and alerting
- Appointment cancellation/rescheduling policy
- Doctor leave/holiday tables
- Notification worker for SMS/email
- Load testing before claiming a 1,000 requests/second capacity

Do not put NVIDIA API keys, database passwords, or Redis passwords in React.


## Doctor availability and leave

The appointment scheduler now shows each active doctor as:

- **Available** — new appointments can be booked.
- **On leave** — new appointments are disabled for that date and the leave reason is shown.

Admin can confirm a doctor's leave from the **Admin daily schedule** screen. A confirmed leave:

1. Appears in the doctor's availability endpoint.
2. Blocks all currently AVAILABLE slots for that date.
3. Prevents new appointment bookings for that doctor/date.
4. Keeps already-confirmed appointments in the database so staff can see the patients who were previously booked.
5. Can be cancelled by admin, which reopens blocked slots.

For tomorrow, open the admin schedule and select tomorrow's date. Confirm leave for any doctor who will not attend. The public booking UI will then automatically show that doctor as unavailable for tomorrow.

New API endpoints:

```http
GET /api/doctors/availability?date=YYYY-MM-DD
POST /api/admin/doctor-leaves
DELETE /api/admin/doctor-leaves/{doctor_id}?date=YYYY-MM-DD
GET /api/admin/doctors/leave-schedule?date=YYYY-MM-DD
```

Before production, protect all `/api/admin/*` endpoints with authentication and role-based access.
