from agents.shared.base_agent import make_app

from .agent import SmartRecommendAgent

app = make_app(SmartRecommendAgent(), service_name="smart_recommend_agent")
