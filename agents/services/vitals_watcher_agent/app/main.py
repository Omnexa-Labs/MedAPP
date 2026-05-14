from agents.shared import make_app

from .agent import VitalsWatcherAgent

app = make_app(VitalsWatcherAgent(), service_name="vitals_watcher_agent")
