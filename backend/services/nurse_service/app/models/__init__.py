from shared.db import Base

from .nurse import NurseProfile, NurseServiceArea

__all__ = ["Base", "NurseProfile", "NurseServiceArea"]