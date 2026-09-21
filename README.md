# Medi+ — Appointment + AI Chatbot

This package merges the existing **Medi+ website + appointment/doctor availability system** with the AI chatbot backend.

## Website guarantee

The existing website layout, sections, colors, appointment UI, doctor availability UI, and admin schedule are kept unchanged. The only frontend feature changed is the floating **Medi+ AI Assistant**.

## AI chatbot

- NVIDIA API-backed AI chat
- Mistral-NeMo-Minitron 8B configurable through `NVIDIA_MODEL`
- Same PostgreSQL doctor/leave/slot schedule as **Book an Appointment**
- Live availability answers
- Persistent chat history in PostgreSQL
- Old chat sessions/history in the chatbot UI
- New chat button
- Voice input using browser Speech Recognition (Chrome/Edge)
- AI answer read-aloud using browser speech synthesis
- NVIDIA API key stays on the backend

### Chat endpoints

- `POST /api/chat`
- `GET /api/chat/history?session_id=...`

The frontend sends a stable `session_id` and unique `message_id`, so the backend can restore previous messages and avoid duplicate assistant responses.

## Appointment connection

The chatbot reads the same database tables used by the booking flow:

- doctors
- doctor_leaves
- appointment_slots
- appointments

Therefore, the chatbot does not maintain a separate appointment calendar. If a doctor is on confirmed leave, the chatbot reports the same unavailable status used by the booking screen.

## Run locally

### 1. Configure NVIDIA

Create `backend/.env` from `backend/.env.example` and set:

```env
NVIDIA_API_KEY=your_nvidia_key
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=mistralai/Mistral-NeMo-Minitron-8B-Instruct
```

Do not put the NVIDIA key in the React/Vite frontend.

### 2. Start backend, PostgreSQL and Redis

```powershell
docker compose up -d --build
docker compose ps
```

Backend: `http://localhost:8000`
Swagger: `http://localhost:8000/docs`

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
