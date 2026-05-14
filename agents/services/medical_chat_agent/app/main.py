from agents.shared import make_app

from .agent import MedicalChatAgent

app = make_app(MedicalChatAgent(), service_name="medical_chat_agent")
