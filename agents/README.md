# MedApp Agents

Agentic AI layer. Each agent is a FastAPI service that uses **Claude Opus 4.7** as its brain and calls MedApp backend microservices as tools.

**Not ML training, not model serving** — we don't fine-tune. We orchestrate Claude with tool use.

## Surface choice: Claude API + tool use (not Managed Agents)

We use **Claude API with the SDK's beta tool runner** because:
- Our tools are HTTP calls to our own internal services (booking, EHR, payments) — no sandbox/bash/code-exec workspace needed
- PHI stays inside our VPC; calling internal services from inside our FastAPI is cleaner for HIPAA boundaries
- Each agent is a stateless FastAPI service; scaling and observability live alongside the other backend services

## Agents

| Service | Port | Persona | Primary tools |
|---|---|---|---|
| concierge_agent | 9001 | The user's personal medical assistant — orchestrates everything else | search_providers, book_appointment, get_ehr, send_message |
| smart_recommend_agent | 9002 | Lifestyle, diet, and medication recommendations from EHR + wearables | get_ehr, get_vitals_history, get_medications |
| medical_chat_agent | 9003 | Long-form symptom triage and health Q&A | get_ehr, get_medications, lookup_drug_interactions |
| lab_reader_agent | 9004 | Reads uploaded lab results / prescriptions (vision) and explains them | upload_to_ehr, lookup_drug_interactions, find_specialist |
| vitals_watcher_agent | 9005 | Streams wearable data, alerts on anomalies, suggests action | get_vitals_history, send_alert, find_specialist |
| booking_agent | 9006 | Specialised "book me an appointment" sub-agent the concierge can call | search_providers, get_doctor_availability, create_booking, process_payment |

## Conventions

- **Model**: `claude-opus-4-7` everywhere. Adaptive thinking on by default (`thinking: {type: "adaptive"}`).
- **Tool runner**: SDK beta `@beta_tool` decorators. No manual loops unless a tool needs human-in-the-loop approval.
- **Prompt caching**: every agent has a frozen system prompt + tool list, marked with `cache_control` so cache hit rate stays high.
- **Memory**: per-user conversational state lives in `user_service` / `ehr_service` — agents are stateless, the patient ID arrives in each request and is propagated to all tool calls.
- **PHI**: agents never log raw EHR content. Use `structlog.bind(patient_id=…)` and reference by ID only.

## Layout

```
agents/
  shared/                    # Claude client factory, tool helpers, base FastAPI, PHI redaction
  services/<agent>/
    app/
      main.py                # FastAPI + /chat endpoint
      config.py              # env-driven settings (model, max_tokens, downstream URLs)
      agent.py               # tool runner setup
      tools.py               # @beta_tool functions wrapping MedApp services
    Dockerfile
    pyproject.toml
    tests/
  prompts/                   # canonical system prompts per agent (cached prefix)
  tools/                     # shared tool implementations imported by multiple agents
```
