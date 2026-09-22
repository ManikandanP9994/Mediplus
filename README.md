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
docker compose ps
```

Backend: `http://localhost:8000`
Swagger: `http://localhost:8000/docs`

To run the API directly with the backend virtual environment, use:

```powershell
cd backend
.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

### 3. Start frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

`frontend/.env.example` contains:

```env
VITE_API_URL=http://localhost:8000
VITE_CHAT_API_URL=http://localhost:8000/api/chat
```

## Important NVIDIA model note

Keep `NVIDIA_MODEL` configurable. NVIDIA's public catalog has changed model availability over time, so verify the exact model ID enabled for your NVIDIA account before production deployment.

## Healthcare safety

The chatbot is an informational assistant, not a doctor. It must not diagnose, prescribe, or replace professional medical care. For urgent concerns, users should seek qualified medical/emergency care. Before production use with real patient data, add authentication/authorization, HTTPS, rate limiting, audit logging, secure secrets management, privacy controls, backups, monitoring, and appropriate healthcare compliance controls.
