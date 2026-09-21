import secrets
from datetime import date, datetime, time, timedelta

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .models import Appointment, AppointmentSlot, Doctor, DoctorLeave, Patient


def _slot_windows(doctor: Doctor):
    step = timedelta(minutes=doctor.slot_minutes)
    cursor = datetime.combine(date.today(), doctor.start_time)
    end = datetime.combine(date.today(), doctor.end_time)

    while cursor.time() < doctor.end_time:
        slot_end = cursor + step
        if slot_end.time() > doctor.end_time:
            break

        start = cursor.time()
        finish = slot_end.time()

        in_break = (
            doctor.break_start is not None
            and doctor.break_end is not None
            and start < doctor.break_end
            and finish > doctor.break_start
        )

        if not in_break:
            yield start, finish

        cursor = slot_end


async def generate_daily_slots(db: AsyncSession, target_date: date):
    doctors = (await db.execute(select(Doctor).where(Doctor.active.is_(True)))).scalars().all()
    created = 0
    skipped = 0

    leave_rows = (
        await db.execute(
            select(DoctorLeave).where(
                DoctorLeave.leave_date == target_date,
                DoctorLeave.status == "CONFIRMED",
            )
        )
    ).scalars().all()
    leave_doctors = {x.doctor_id for x in leave_rows}

    for doctor in doctors:
        if doctor.id in leave_doctors:
            continue
        existing = (
            await db.execute(
                select(AppointmentSlot.start_time).where(
                    AppointmentSlot.doctor_id == doctor.id,
                    AppointmentSlot.appointment_date == target_date,
                )
            )
        ).scalars().all()
        existing_set = set(existing)

        for start, finish in _slot_windows(doctor):
            if start in existing_set:
                skipped += 1
                continue
            db.add(
                AppointmentSlot(
                    doctor_id=doctor.id,
                    appointment_date=target_date,
                    start_time=start,
                    end_time=finish,
                    status="AVAILABLE",
                )
            )
            created += 1

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Safe under concurrent generation because the unique constraint
        # prevents duplicate doctor/date/start combinations.
        created = 0

    return created, skipped


def booking_reference() -> str:
    stamp = datetime.now().strftime("%Y%m%d")
    return f"MED-{stamp}-{secrets.token_hex(4).upper()}"


async def acquire_slot_lock(redis: Redis, doctor_id: int, slot_id: int):
    key = f"medi+:appointment-lock:{doctor_id}:{slot_id}"
    token = secrets.token_urlsafe(18)
    acquired = await redis.set(
        key,
        token,
        nx=True,
        ex=settings.appointment_hold_seconds,
    )
    return key, token if acquired else None


async def release_slot_lock(redis: Redis, key: str, token: str | None):
    if not token:
        return
    current = await redis.get(key)
    if current == token:
        await redis.delete(key)


async def create_appointment(
    db: AsyncSession,
    redis: Redis,
    *,
    doctor_id: int,
    slot_id: int,
    appointment_date: date,
    patient_name: str,
    patient_phone: str,
    patient_email: str | None,
    idempotency_key: str,
):
    key, token = await acquire_slot_lock(redis, doctor_id, slot_id)
    if not token:
        raise ValueError("This appointment slot is currently being booked. Please choose another slot.")

    try:
        async with db.begin():
            existing = (
                await db.execute(
                    select(Appointment).where(Appointment.idempotency_key == idempotency_key)
                )
            ).scalar_one_or_none()
            if existing:
                return existing

            slot = (
                await db.execute(
                    select(AppointmentSlot)
                    .where(
                        AppointmentSlot.id == slot_id,
                        AppointmentSlot.doctor_id == doctor_id,
                        AppointmentSlot.appointment_date == appointment_date,
                    )
                    .with_for_update()
                )
            ).scalar_one_or_none()

            if not slot:
                raise LookupError("Appointment slot not found.")

            if slot.status != "AVAILABLE":
                raise ValueError("This appointment slot is already booked.")

            patient = (
                await db.execute(
                    select(Patient).where(Patient.phone == patient_phone)
                )
            ).scalar_one_or_none()

            if not patient:
                patient = Patient(
                    name=patient_name,
                    phone=patient_phone,
                    email=patient_email,
                )
                db.add(patient)
                await db.flush()
            else:
                patient.name = patient_name
                patient.email = patient_email

            appointment = Appointment(
                patient_id=patient.id,
                doctor_id=doctor_id,
                slot_id=slot.id,
                appointment_date=appointment_date,
                start_time=slot.start_time,
                end_time=slot.end_time,
                status="CONFIRMED",
                booking_reference=booking_reference(),
                idempotency_key=idempotency_key,
            )
            db.add(appointment)
            slot.status = "BOOKED"
            await db.flush()

        return appointment
    finally:
        await release_slot_lock(redis, key, token)
