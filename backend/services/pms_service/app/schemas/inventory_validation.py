from typing import Annotated

from pydantic import Field

Units = Annotated[int, Field(strict=True, ge=1, le=1_000_000)]
Money = Annotated[int, Field(strict=True, ge=0, le=2_147_483_647)]
