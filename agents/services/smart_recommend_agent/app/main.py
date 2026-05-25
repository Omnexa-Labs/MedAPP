"""Smart Recommendation service entry point.

Exposes the standard /healthz and /chat endpoints from `make_app`, plus a
/analyze endpoint specific to this agent (pull-mode trigger for the
deterministic engine + LLM personalizer pipeline).

Both /chat and /analyze require a verified JWT — the auth dependency
created by `make_app` is reused here so /analyze enforces the same
IDOR rules as /chat (non-admin tokens can only analyze their own
patient_id).
"""
from fastapi import Depends

from agents.shared import Principal, enforce_patient_scope, make_app

from .agent import AnalyzeRequest, AnalyzeResponse, SmartRecommendAgent

_agent = SmartRecommendAgent()
app = make_app(_agent, service_name="smart_recommend_agent")
# make_app stashed the auth dependency on app.state — reuse it on /analyze
# so we don't end up with two divergent verifications.
_require_principal = app.state.require_principal


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    req: AnalyzeRequest,
    principal: Principal = Depends(_require_principal),
) -> AnalyzeResponse:
    req.patient_id = enforce_patient_scope(
        requested=req.patient_id, principal=principal
    )
    return await _agent.analyze(req)
