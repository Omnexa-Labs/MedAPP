from agents.shared import make_app

from .agent import LabReaderAgent

app = make_app(LabReaderAgent(), service_name="lab_reader_agent")
