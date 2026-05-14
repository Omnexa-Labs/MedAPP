from agents.shared.base_agent import make_app

from .agent import MedicalChatAgent

app = make_app(MedicalChatAgent(), service_name="medical_chat_agent")
