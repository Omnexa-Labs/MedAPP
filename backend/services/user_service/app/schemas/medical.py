"""Typed schema for ``users.medical_history`` (audit finding B-12).

The column stays JSONB so we don't have to design a relational shape for
PHI before the product owns one, but every WRITE goes through this
schema. Without it the column accepted any JSON value the client cared
to ship — credit card numbers, social media handles, arbitrarily large
notes blobs — none of which the platform has lawful reason to store
and none of which we can selectively redact in audit logs / exports
because the shape is unknown.

Design notes:

* Every model sets ``extra="forbid"``. A field the schema doesn't
  declare is rejected, not silently dropped — surfacing client bugs
  loudly and stopping incidental PII bleed.
* All free-text fields have explicit ``max_length``. A misbehaving
  client cannot inflate a row to multi-megabyte JSON.
* List collections cap at 50 entries. The product can negotiate a
  higher cap later if that's an actual user need; the wide-open default
  is the dangerous one.
* ``status`` and ``relation`` are ``Literal`` enums — the set of
  possible values is part of the contract, not a free string.

The ORM model carries a ``@validates`` hook that re-runs this schema on
every assignment, so service-layer writes (admin tools, data imports,
sync jobs) cannot bypass the API-level allowlist.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


_AllergyName = Annotated[str, StringConstraints(min_length=1, max_length=120)]


class MedicalCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    diagnosed_on: date | None = None
    status: Literal["active", "resolved", "in_remission"] = "active"
    notes: str | None = Field(default=None, max_length=500)


class Medication(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    dosage: str | None = Field(default=None, max_length=80)
    frequency: str | None = Field(default=None, max_length=80)
    started_on: date | None = None
    ended_on: date | None = None


class Surgery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    procedure: str = Field(min_length=1, max_length=160)
    performed_on: date | None = None
    hospital: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=500)


class FamilyHistoryEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relation: Literal[
        "mother", "father", "sibling", "child", "grandparent", "other"
    ]
    condition: str = Field(min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=300)


class MedicalHistory(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conditions: list[MedicalCondition] = Field(default_factory=list, max_length=50)
    medications: list[Medication] = Field(default_factory=list, max_length=50)
    surgeries: list[Surgery] = Field(default_factory=list, max_length=50)
    family_history: list[FamilyHistoryEntry] = Field(
        default_factory=list, max_length=50
    )
    notes: str | None = Field(default=None, max_length=2000)


__all__ = [
    "MedicalCondition",
    "Medication",
    "Surgery",
    "FamilyHistoryEntry",
    "MedicalHistory",
    "_AllergyName",
]
