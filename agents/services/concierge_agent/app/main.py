from agents.shared.base_agent import make_app

from .agent import ConciergeAgent

app = make_app(ConciergeAgent(), service_name="concierge_agent")
