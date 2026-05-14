from agents.shared import make_app

from .agent import BookingAgent

app = make_app(BookingAgent(), service_name="booking_agent")
