from datetime import date, time
from pydantic import BaseModel, Field


class DoctorOut(BaseModel):
    id: int
    name: str
    specialization: str
    start_time: time
    end_time: time
    break_start: time | None
    break_end: time | None
    slot_minutes: int


class SlotOut(BaseModel):
    id: int
    start_time: time
    end_time: time
    status: str


class AppointmentCreate(BaseModel):
    doctor_id: int
    slot_id: int
    appointment_date: date
    patient_name: str = Field(min_length=2, max_length=120)
    patient_phone: str = Field(min_length=7, max_length=30)
    patient_email: str | None = None


class AppointmentOut(BaseModel):
    id: int
    booking_reference: str
    patient_name: str
    patient_phone: str
    patient_email: str | None
    doctor_id: int
    doctor_name: str
    specialization: str
    appointment_date: date
    start_time: time
    end_time: time
    status: str


class GenerateSlotsOut(BaseModel):
    date: date
    created: int
    skipped_existing: int


class DoctorAvailabilityOut(BaseModel):
    doctor_id: int
    doctor_name: str
    specialization: str
    date: date
    available: bool
    status: str
    reason: str | None = None


class DoctorLeaveCreate(BaseModel):
    doctor_id: int
    leave_date: date
    reason: str | None = None


class ChatMessageIn(BaseModel):
    session_id: str = Field(min_length=8, max_length=100)
    message_id: str = Field(min_length=8, max_length=100)
    message: str = Field(min_length=1, max_length=4000)


class ChatMessageOut(BaseModel):
    session_id: str
    message_id: str
    answer: str
    created_at: str


class ChatHistoryMessageOut(BaseModel):
    message_id: str
    role: str
    content: str
    created_at: str
