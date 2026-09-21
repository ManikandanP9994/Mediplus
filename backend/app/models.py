from datetime import date, datetime, time
from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, String, Time, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(30), index=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    specialization: Mapped[str] = mapped_column(String(120))
    start_time: Mapped[time] = mapped_column(Time, default=time(9, 0))
    end_time: Mapped[time] = mapped_column(Time, default=time(17, 0))
    break_start: Mapped[time | None] = mapped_column(Time, nullable=True, default=time(13, 0))
    break_end: Mapped[time | None] = mapped_column(Time, nullable=True, default=time(14, 0))
    slot_minutes: Mapped[int] = mapped_column(Integer, default=10)
    active: Mapped[bool] = mapped_column(default=True)


class AppointmentSlot(Base):
    __tablename__ = "appointment_slots"
    __table_args__ = (
        UniqueConstraint("doctor_id", "appointment_date", "start_time", name="uq_doctor_date_start"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), index=True)
    appointment_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    status: Mapped[str] = mapped_column(String(20), default="AVAILABLE", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    doctor = relationship("Doctor")


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (
        UniqueConstraint("doctor_id", "appointment_date", "slot_id", name="uq_appointment_doctor_slot"),
        UniqueConstraint("booking_reference", name="uq_booking_reference"),
        UniqueConstraint("idempotency_key", name="uq_idempotency_key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"))
    slot_id: Mapped[int] = mapped_column(ForeignKey("appointment_slots.id"))
    appointment_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    status: Mapped[str] = mapped_column(String(20), default="CONFIRMED", index=True)
    booking_reference: Mapped[str] = mapped_column(String(40))
    idempotency_key: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    patient = relationship("Patient")
    doctor = relationship("Doctor")
    slot = relationship("AppointmentSlot")


class DoctorLeave(Base):
    __tablename__ = "doctor_leaves"
    __table_args__ = (
        UniqueConstraint("doctor_id", "leave_date", name="uq_doctor_leave_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), index=True)
    leave_date: Mapped[date] = mapped_column(Date, index=True)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="CONFIRMED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    doctor = relationship("Doctor")
