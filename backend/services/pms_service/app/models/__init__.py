# Importing core registers all SQLAlchemy models on shared.db.Base.metadata.
from shared.onboarding.receipts import ActivationReceipt  # noqa: F401

from . import core  # noqa: F401
from .delivery import MedAppDelivery  # noqa: F401
from .clinical_handoff import ClinicalHandoffReceipt  # noqa: F401
from .workspace import MedAppMembership, MedAppWorkspace  # noqa: F401
