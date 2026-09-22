from datetime import date

import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from .config import settings
from .db import Base, SessionLocal, engine
from .models import Appointment, AppointmentSlot, Doctor, DoctorLeave, ChatSession, ChatMessage
from .schemas import (
    AppointmentCreate,
    AppointmentOut,
    DoctorOut,
    GenerateSlotsOut,
    SlotOut,
    DoctorAvailabilityOut,
    DoctorLeaveCreate,
    ChatMessageIn, ChatMessageOut, ChatHistoryMessageOut,
)
from .services import create_appointment, generate_daily_slots
from .chat_service import generate_ai_answer


app = FastAPI(title="Medi+ Appointment API", version="1.0.0")
redis = Redis.from_url(settings.redis_url, decode_responses=True)

origins = [x.strip() for x in settings.cors_origins.split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "https://mediplus-hospital.netlify.app/",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS uq_chat_session_message"))
        await conn.execute(text(
            "ALTER TABLE chat_messages ADD CONSTRAINT uq_chat_session_message "
            "UNIQUE (session_id, message_id, role)"
        ))

    async with SessionLocal() as db:
        doctors = (await db.execute(select(Doctor))).scalars().all()
        if not doctors:
            db.add_all(
                [
                    Doctor(name="Dr. Ananya Rao", specialization="General Medicine"),
                    Doctor(name="Dr. Arjun Kumar", specialization="Cardiology"),
                    Doctor(name="Dr. Meera Shah", specialization="Women's Health"),
                ]
            )
            await db.commit()

        await generate_daily_slots(db, date.today())


@app.on_event("shutdown")
async def shutdown():
    await redis.aclose()
    await engine.dispose()


@app.get("/api/health")
async def health():
    await redis.ping()
    return {"status": "ok", "database": "connected", "redis": "connected"}


@app.post("/api/chat", response_model=ChatMessageOut)
async def chat(payload: ChatMessageIn):
    async with SessionLocal() as db:
        existing = (await db.execute(
            select(ChatMessage).where(
                ChatMessage.session_id == payload.session_id,
                ChatMessage.message_id == payload.message_id,
                ChatMessage.role == "assistant",
            )
        )).scalar_one_or_none()
        if existing:
            return ChatMessageOut(
                session_id=payload.session_id,
                message_id=payload.message_id,
                answer=existing.content,
                created_at=existing.created_at.isoformat(),
            )

        session = (await db.execute(select(ChatSession).where(ChatSession.session_id == payload.session_id))).scalar_one_or_none()
        if session is None:
            session = ChatSession(session_id=payload.session_id)
            db.add(session)
            await db.flush()

        history_rows = (await db.execute(
            select(ChatMessage).where(ChatMessage.session_id == payload.session_id).order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        )).scalars().all()
        history = [{"role": x.role, "content": x.content} for x in history_rows[-10:]]

        answer, _context = await generate_ai_answer(db, payload.message, history)

        # Store the user turn and assistant turn under the same message_id.
        db.add(ChatMessage(session_id=payload.session_id, message_id=payload.message_id, role="user", content=payload.message))
        db.add(ChatMessage(session_id=payload.session_id, message_id=payload.message_id, role="assistant", content=answer))
        await db.commit()

        created = (await db.execute(
            select(ChatMessage).where(ChatMessage.session_id == payload.session_id, ChatMessage.message_id == payload.message_id, ChatMessage.role == "assistant")
        )).scalar_one()
        return ChatMessageOut(session_id=payload.session_id, message_id=payload.message_id, answer=answer, created_at=created.created_at.isoformat())


@app.get("/api/chat/history", response_model=list[ChatHistoryMessageOut])
async def chat_history(session_id: str = Query(..., min_length=8, max_length=100)):
    async with SessionLocal() as db:
        rows = (await db.execute(
            select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        )).scalars().all()
        return [ChatHistoryMessageOut(message_id=x.message_id, role=x.role, content=x.content, created_at=x.created_at.isoformat()) for x in rows]


@app.get("/api/doctors", response_model=list[DoctorOut])
async def doctors():
    async with SessionLocal() as db:
        rows = (await db.execute(select(Doctor).where(Doctor.active.is_(True)).order_by(Doctor.name))).scalars().all()
        return rows


@app.post("/api/admin/generate-slots", response_model=GenerateSlotsOut)
async def generate_slots(target_date: date = Query(...)):
    async with SessionLocal() as db:
        created, skipped = await generate_daily_slots(db, target_date)
        return GenerateSlotsOut(date=target_date, created=created, skipped_existing=skipped)


@app.get("/api/doctors/{doctor_id}/slots", response_model=list[SlotOut])
async def doctor_slots(doctor_id: int, target_date: date = Query(..., alias="date")):
    async with SessionLocal() as db:
        slots = (
            await db.execute(
                select(AppointmentSlot)
                .where(
                    AppointmentSlot.doctor_id == doctor_id,
                    AppointmentSlot.appointment_date == target_date,
                )
                .order_by(AppointmentSlot.start_time)
            )
        ).scalars().all()

        if not slots:
            await generate_daily_slots(db, target_date)
            slots = (
                await db.execute(
                    select(AppointmentSlot)
                    .where(
                        AppointmentSlot.doctor_id == doctor_id,
                        AppointmentSlot.appointment_date == target_date,
                    )
                    .order_by(AppointmentSlot.start_time)
                )
            ).scalars().all()

        return slots


@app.get("/api/doctors/availability", response_model=list[DoctorAvailabilityOut])
async def doctor_availability(target_date: date = Query(..., alias="date")):
    async with SessionLocal() as db:
        doctors = (
            await db.execute(
                select(Doctor).where(Doctor.active.is_(True)).order_by(Doctor.name)
            )
        ).scalars().all()

        leaves = (
            await db.execute(
                select(DoctorLeave).where(
                    DoctorLeave.leave_date == target_date,
                    DoctorLeave.status == "CONFIRMED",
                )
            )
        ).scalars().all()
        leave_map = {x.doctor_id: x for x in leaves}

        result = []
        for doctor in doctors:
            leave = leave_map.get(doctor.id)
            result.append(
                DoctorAvailabilityOut(
                    doctor_id=doctor.id,
                    doctor_name=doctor.name,
                    specialization=doctor.specialization,
                    date=target_date,
                    available=leave is None,
                    status="ON_LEAVE" if leave else "AVAILABLE",
                    reason=leave.reason if leave else None,
                )
            )
        return result


@app.post("/api/admin/doctor-leaves")
async def add_doctor_leave(payload: DoctorLeaveCreate):
    async with SessionLocal() as db:
        doctor = await db.get(Doctor, payload.doctor_id)
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        existing = (
            await db.execute(
                select(DoctorLeave).where(
                    DoctorLeave.doctor_id == payload.doctor_id,
                    DoctorLeave.leave_date == payload.leave_date,
                )
            )
        ).scalar_one_or_none()

        if existing:
            existing.reason = payload.reason
            existing.status = "CONFIRMED"
        else:
            db.add(
                DoctorLeave(
                    doctor_id=payload.doctor_id,
                    leave_date=payload.leave_date,
                    reason=payload.reason,
                    status="CONFIRMED",
                )
            )

        # Remove availability for a confirmed leave date.
        slots = (
            await db.execute(
                select(AppointmentSlot).where(
                    AppointmentSlot.doctor_id == payload.doctor_id,
                    AppointmentSlot.appointment_date == payload.leave_date,
                    AppointmentSlot.status == "AVAILABLE",
                )
            )
        ).scalars().all()
        for slot in slots:
            slot.status = "BLOCKED"

        await db.commit()
        return {"success": True, "doctor_id": payload.doctor_id, "leave_date": payload.leave_date, "status": "CONFIRMED"}


@app.delete("/api/admin/doctor-leaves/{doctor_id}")
async def cancel_doctor_leave(doctor_id: int, leave_date: date = Query(..., alias="date")):
    async with SessionLocal() as db:
        leave = (
            await db.execute(
                select(DoctorLeave).where(
                    DoctorLeave.doctor_id == doctor_id,
                    DoctorLeave.leave_date == leave_date,
                )
            )
        ).scalar_one_or_none()
        if not leave:
            raise HTTPException(status_code=404, detail="Leave record not found.")

        leave.status = "CANCELLED"
        slots = (
            await db.execute(
                select(AppointmentSlot).where(
                    AppointmentSlot.doctor_id == doctor_id,
                    AppointmentSlot.appointment_date == leave_date,
                    AppointmentSlot.status == "BLOCKED",
                )
            )
        ).scalars().all()
        for slot in slots:
            slot.status = "AVAILABLE"
        await db.commit()
        return {"success": True}


@app.get("/api/admin/doctors/leave-schedule")
async def leave_schedule(target_date: date = Query(..., alias="date")):
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(DoctorLeave, Doctor)
                .join(Doctor, Doctor.id == DoctorLeave.doctor_id)
                .where(
                    DoctorLeave.leave_date == target_date,
                    DoctorLeave.status == "CONFIRMED",
                )
                .order_by(Doctor.name)
            )
        ).all()
        return [
            {
                "doctor_id": leave.doctor_id,
                "doctor_name": doctor.name,
                "specialization": doctor.specialization,
                "date": leave.leave_date,
                "status": leave.status,
                "reason": leave.reason,
            }
            for leave, doctor in rows
        ]


@app.post("/api/appointments", response_model=AppointmentOut)
async def book_appointment(
    payload: AppointmentCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if not idempotency_key:
        raise HTTPException(status_code=400, detail="Idempotency-Key header is required.")

    async with SessionLocal() as db:
        leave = (
            await db.execute(
                select(DoctorLeave).where(
                    DoctorLeave.doctor_id == payload.doctor_id,
                    DoctorLeave.leave_date == payload.appointment_date,
                    DoctorLeave.status == "CONFIRMED",
                )
            )
        ).scalar_one_or_none()
        if leave:
            raise HTTPException(
                status_code=409,
                detail=f"Doctor is on confirmed leave on {payload.appointment_date}. {leave.reason or ''}".strip(),
            )

        await db.commit()

        try:
            appointment = await create_appointment(
                db,
                redis,
                doctor_id=payload.doctor_id,
                slot_id=payload.slot_id,
                appointment_date=payload.appointment_date,
                patient_name=payload.patient_name,
                patient_phone=payload.patient_phone,
                patient_email=payload.patient_email,
                idempotency_key=idempotency_key,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

        await db.refresh(appointment, attribute_names=["patient", "doctor"])
        return AppointmentOut(
            id=appointment.id,
            booking_reference=appointment.booking_reference,
            patient_name=appointment.patient.name,
            patient_phone=appointment.patient.phone,
            patient_email=appointment.patient.email,
            doctor_id=appointment.doctor_id,
            doctor_name=appointment.doctor.name,
            specialization=appointment.doctor.specialization,
            appointment_date=appointment.appointment_date,
            start_time=appointment.start_time,
            end_time=appointment.end_time,
            status=appointment.status,
        )


@app.get("/api/admin/appointments", response_model=list[AppointmentOut])
async def admin_appointments(target_date: date = Query(..., alias="date")):
    # Demo endpoint. Add authentication/authorization before production use.
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(Appointment)
                .options(selectinload(Appointment.patient), selectinload(Appointment.doctor))
                .where(Appointment.appointment_date == target_date)
                .order_by(Appointment.start_time)
            )
        ).scalars().all()

        return [
            AppointmentOut(
                id=x.id,
                booking_reference=x.booking_reference,
                patient_name=x.patient.name,
                patient_phone=x.patient.phone,
                patient_email=x.patient.email,
                doctor_id=x.doctor_id,
                doctor_name=x.doctor.name,
                specialization=x.doctor.specialization,
                appointment_date=x.appointment_date,
                start_time=x.start_time,
                end_time=x.end_time,
                status=x.status,
            )
            for x in rows
        ]
