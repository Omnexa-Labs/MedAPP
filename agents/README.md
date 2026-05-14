# MedApp Agents

Agentic AI layer. Each agent is a FastAPI service that drives an LLM (provider TBD)
to orchestrate MedApp backend microservices as tools.

**No training, no model serving.** We don't fine-tune. We orchestrate an LLM with tool use.

## LLM provider — not yet chosen

The LLM provider is **abstracted behind an `LLMProvider` interface** in
`agents/shared/llm.py`. We have not yet committed to OpenAI, Anthropic Claude,
Google Gemini, or a self-hosted model.

- Default in dev/CI: `MockLLM` — deterministic canned responses, no network, no key.
- To pick a real provider: implement a single class in `agents/shared/llm.py`
  (≈ 30 lines) and flip `LLM_PROVIDER=<name>` in env. See `ADR 0002` in `docs/adr/`.

## Agents

| Service | Port | Persona | Primary tools |
|---|---|---|---|
| concierge_agent | 9001 | Personal medical assistant — orchestrates everything else | search_providers, book_appointment, get_ehr, send_message |
| smart_recommend_agent | 9002 | Lifestyle, diet, and medication recommendations from EHR + wearables | get_ehr, get_vitals_history, get_medications |
| medical_chat_agent | 9003 | Long-form symptom triage and health Q&A | get_ehr, get_medications, lookup_drug_interactions |
| lab_reader_agent | 9004 | Reads uploaded lab results / prescriptions (vision) and explains them | upload_to_ehr, lookup_drug_interactions, find_specialist |
| vitals_watcher_agent | 9005 | Streams wearable data, alerts on anomalies, suggests action | get_vitals_history, send_alert, find_specialist |
| booking_agent | 9006 | Specialised "book me an appointment" sub-agent the concierge can call | search_providers, get_doctor_availability, create_booking, process_payment |

## Conventions

- **Provider-agnostic.** Tool definitions are plain JSON schemas. Prompts are plain Markdown. Nothing in the agent code imports a vendor SDK.
- **Tools are HTTP wrappers** around internal MedApp services. The agent passes `patient_id`; we forward it as `X-Patient-Id` for row-level access control.
- **PHI never goes to logs/traces.** Use `agents/shared/phi.py::redact()` before `structlog.bind()` or attaching anything to a span.
- **Agents are stateless.** Conversation state lives in `ehr_service` / `user_service`; the patient ID arrives in each `/chat` request.

## Layout

```
agents/
  shared/
    llm.py                # LLMProvider interface + MockLLM
    base_agent.py         # FastAPI factory + AgentRequest/Response
    medapp_client.py      # httpx client that forwards X-Patient-Id
    phi.py                # redaction
  prompts/                # one .md per agent — frozen system prompts
  services/<agent>/
    app/
      main.py             # FastAPI + /chat
      config.py           # env-driven settings
      agent.py            # wires LLMProvider + tools + prompt
      tools.py            # tool definitions + executors
    Dockerfile
    pyproject.toml
    tests/
```
