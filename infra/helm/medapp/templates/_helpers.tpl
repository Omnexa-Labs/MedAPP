{{/*
DNS-1123 sanitiser. K8s resource names disallow underscores, but our
backend service directories (and image names in Artifact Registry) use
underscores. Templates pass the raw key (e.g. "user_service") to this
helper and get back a valid K8s name (e.g. "user-service"). Image
paths still use the raw key — Docker / Artifact Registry accept both.
*/}}
{{- define "medapp.kname" -}}
{{- . | replace "_" "-" -}}
{{- end -}}

{{/*
Common labels applied to every resource the chart creates. Templates
pass a dict with `serviceName` (the raw key) and `root` (the top-level
scope) so the helper can reach .Release / .Values. The label VALUE is
sanitised via medapp.kname so it matches the resource name.
*/}}
{{- define "medapp.labels" -}}
app.kubernetes.io/name: {{ include "medapp.kname" .serviceName }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
app.kubernetes.io/part-of: medapp
app.kubernetes.io/version: {{ .root.Values.image.tag | quote }}
medapp.env: {{ .root.Values.env }}
{{- end -}}

{{/*
Selector labels — STRICT subset of the labels above. matchLabels on a
Deployment is immutable, so this must never include anything that
varies between releases (e.g. image tag).
*/}}
{{- define "medapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "medapp.kname" .serviceName }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end -}}
