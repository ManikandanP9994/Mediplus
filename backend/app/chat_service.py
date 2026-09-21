from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .models import Doctor, DoctorLeave, AppointmentSlot


def _date_from_text(text: str) -> date:
    t = text.lower()
    today = date.today()
    if "tomorrow" in t:
        return today + timedelta(days=1)
    return today


async def appointment_context(db: AsyncSession, user_text: str) -> dict[str, Any]:
    target = _date_from_text(user_text)
    doctors = (
        await db.execute(select(Doctor).where(Doctor.active.is_(True)).order_by(Doctor.name))
    ).scalars().all()
    leaves = (
        await db.execute(
            select(DoctorLeave).where(
                DoctorLeave.leave_date == target,
                DoctorLeave.status == "CONFIRMED",
            )
        )
    ).scalars().all()
    leave_map = {x.doctor_id: x for x in leaves}

    result = []
    for doctor in doctors:
        leave = leave_map.get(doctor.id)
        slots = []
        if not leave:
            rows = (
                await db.execute(
                    select(AppointmentSlot)
                    .where(
                        AppointmentSlot.doctor_id == doctor.id,
                        AppointmentSlot.appointment_date == target,
                    )
                    .order_by(AppointmentSlot.start_time)
                )
            ).scalars().all()
            slots = [s.start_time.strftime("%H:%M") for s in rows if s.status == "AVAILABLE"]
        result.append(
            {
                "doctor_id": doctor.id,
                "doctor": doctor.name,
                "specialization": doctor.specialization,
                "date": target.isoformat(),
                "status": "ON_LEAVE" if leave else "AVAILABLE",
                "leave_reason": leave.reason if leave else None,
                "available_slots": slots[:30],
            }
        )
    return {"date": target.isoformat(), "doctors": result}


def fallback_answer(user_text: str, context: dict[str, Any]) -> str:
    t = user_text.lower()
    if any(x in t for x in ["appointment", "doctor", "slot", "available", "availability", "book"]):
        lines = [f"Here is the live Medi+ appointment availability for {context['date']}:"]
        for d in context["doctors"]:
            if d["status"] == "ON_LEAVE":
                lines.append(f"• {d['doctor']} — {d['specialization']}: ON LEAVE ({d['leave_reason'] or 'confirmed leave'}).")
            else:
                slots = ", ".join(d["available_slots"][:8]) if d["available_slots"] else "no open slots"
                lines.append(f"• {d['doctor']} — {d['specialization']}: AVAILABLE. Open slots: {slots}.")
        lines.append("You can use the Book an appointment button to choose the same live schedule and confirm a 10-minute slot.")
        return "\n".join(lines)
    return ("I’m the Medi+ AI assistant. I can help with Medi+ services and the live appointment schedule. "
            "For symptoms, diagnosis, medication, or urgent concerns, please contact a qualified healthcare professional or emergency service.")


async def generate_ai_answer(db: AsyncSession, user_text: str, history: list[dict[str, str]]) -> tuple[str, dict[str, Any]]:
    context = await appointment_context(db, user_text)
    if not settings.nvidia_api_key:
        return fallback_answer(user_text, context), context

    client = AsyncOpenAI(base_url=settings.nvidia_base_url, api_key=settings.nvidia_api_key)
    system = (
        "You are the Medi+ healthcare website assistant. Use only the supplied live appointment context for "
        "doctor availability and appointment slots. Never invent doctors, slots, schedules, bookings, diagnoses, "
        "or medical facts. You may explain Medi+ services. Do not diagnose or prescribe. For urgent symptoms, "
        "tell the user to seek professional/emergency care. Keep answers concise. The website booking flow uses "
        "the exact same backend schedule shown in the context.\n\nLIVE APPOINTMENT CONTEXT:\n" + json.dumps(context, default=str)
    )
    messages = [{"role": "system", "content": system}]
    messages.extend(history[-10:])
    messages.append({"role": "user", "content": user_text})
    try:
        completion = await client.chat.completions.create(
            model=settings.nvidia_model,
            messages=messages,
            temperature=0.2,
            top_p=0.9,
            max_tokens=700,
        )
        answer = completion.choices[0].message.content or fallback_answer(user_text, context)
        return answer, context
    except Exception:
        return fallback_answer(user_text, context), context
