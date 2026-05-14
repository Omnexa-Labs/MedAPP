from agents.shared.base_agent import make_app

from .agent import LabReaderAgent

app = make_app(LabReaderAgent(), service_name="lab_reader_agent")
