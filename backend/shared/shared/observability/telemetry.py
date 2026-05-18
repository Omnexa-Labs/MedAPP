from fastapi import FastAPI

try:
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
except ImportError:  # pragma: no cover - optional dependency in local test envs
    trace = None
    OTLPSpanExporter = None
    FastAPIInstrumentor = None
    Resource = None
    TracerProvider = None
    BatchSpanProcessor = None


def instrument_app(app: FastAPI, *, service_name: str, otlp_endpoint: str | None = None) -> None:
    if trace is None or TracerProvider is None or Resource is None or FastAPIInstrumentor is None:
        return
    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    if otlp_endpoint and OTLPSpanExporter is not None and BatchSpanProcessor is not None:
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint)))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
