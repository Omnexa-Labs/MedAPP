from datetime import date, datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, Field, field_validator, model_validator

from .prescription import StrictModel, Versioned

CourseStatus = Literal["active", "paused", "stopped", "completed"]


class Medicine(StrictModel):
    drug_name: str = Field(min_length=1, max_length=255)
    strength: str = Field(min_length=1, max_length=64)
    form: str = Field(min_length=1, max_length=64)
    dose: str = Field(min_length=1, max_length=80)
    route: str = Field(min_length=1, max_length=40)
    frequency: str = Field(min_length=1, max_length=80)
    duration: str = Field(default="", max_length=80)
    instructions: str = Field(default="", max_length=200)


class CourseCreate(StrictModel):
    prescription_id: UUID | None = None
    prescription_item: int | None = Field(default=None, strict=True, ge=0, le=19)
    medicine: Medicine | None = None
    start_date: date
    end_date: date | None = None
    timezone: str = Field(min_length=1, max_length=64)
    daily_times: list[str] = Field(max_length=12)

    @field_validator("timezone")
    @classmethod
    def known_zone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("use an IANA timezone") from exc
        return value

    @field_validator("daily_times")
    @classmethod
    def distinct_times(cls, values):
        import re

        if len(set(values)) != len(values) or any(
            re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value) is None for value in values
        ):
            raise ValueError("use unique HH:MM tracking times")
        return sorted(values)

    @model_validator(mode="after")
    def source_and_dates(self):
        if self.prescription_id is None:
            if self.medicine is None or self.prescription_item is not None:
                raise ValueError("self-reported medicines require medicine details only")
        elif self.prescription_item is None or self.medicine is not None:
            raise ValueError("prescribed medicines use an issued prescription item only")
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end date must not precede start date")
        return self


class CourseChange(Versioned):
    status: CourseStatus
    reason: str = Field(min_length=3, max_length=500)


class ScheduleRevision(StrictModel):
    effective_date: date
    end_date: date | None = None
    daily_times: list[str] = Field(max_length=12)

    _times = field_validator("daily_times")(CourseCreate.distinct_times.__func__)


class ScheduleChange(ScheduleRevision, Versioned):
    reason: str = Field(min_length=3, max_length=500)


class ReminderChange(Versioned):
    enabled: bool = Field(strict=True)


class DoseCreate(Versioned):
    outcome: Literal["taken", "skipped"]
    day: date | None = None
    time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    occurred_at: AwareDatetime | None = None
    note: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def timing(self):
        if self.occurred_at is None:
            if self.day is None or self.time is None:
                raise ValueError("select a scheduled date and time")
        elif self.day is not None or self.time is not None:
            raise ValueError("manual entries use occurred_at only")
        return self


class DoseChange(Versioned):
    outcome: Literal["taken", "skipped", "voided"]
    reason: str = Field(min_length=3, max_length=500)


class CourseOut(StrictModel):
    id: UUID
    patient_user_id: UUID
    source: Literal["prescribed", "self_reported"]
    prescription_id: UUID | None
    prescription_item: int | None
    prescription_status: Literal["issued", "cancelled", "superseded"] | None
    prescriber_name: str | None
    medicine: Medicine
    status: CourseStatus
    version: int
    start_date: date
    end_date: date | None
    timezone: str
    daily_times: list[str]
    schedule_changes: list[ScheduleRevision] = Field(default_factory=list)
    reminders_enabled: bool = False
    created_at: datetime


class CoursePage(StrictModel):
    items: list[CourseOut]
    offset: int
    limit: int
    next_offset: int | None


class DoseOut(StrictModel):
    id: UUID
    course_id: UUID
    patient_user_id: UUID
    day: date
    time: str | None
    scheduled_at: datetime | None
    occurred_at: datetime | None
    outcome: Literal["taken", "skipped", "voided"]
    note: str
    version: int
    reported_at: datetime


class DosePage(StrictModel):
    items: list[DoseOut]
    offset: int
    limit: int
    next_offset: int | None


class EventOut(StrictModel):
    id: UUID
    kind: str
    payload: dict
    recorded_at: datetime


class EventPage(StrictModel):
    items: list[EventOut]
    offset: int
    limit: int
    next_offset: int | None


class TrackingSlot(StrictModel):
    time: str
    scheduled_at: datetime | None
    state: Literal["due", "upcoming", "not_scheduled", "taken", "skipped", "voided"]
    dose: DoseOut | None = None


class TrackingCourse(StrictModel):
    course: CourseOut
    slots: list[TrackingSlot]
    manual_entries: list[DoseOut]


class TrackingPage(StrictModel):
    day: date
    server_now: datetime
    items: list[TrackingCourse]
    offset: int
    limit: int
    next_offset: int | None
