from agents.shared.base_agent import make_app

from .agent import BookingAgent

app = make_app(BookingAgent(), service_name="booking_agent")
