#!/usr/bin/env bash
set -euo pipefail
# Pulls /openapi.json from each running service and writes to packages/openapi/<service>.json,
# then runs openapi-generator-cli to emit Dart + TypeScript clients.
echo "TODO: implement codegen pipeline (openapi-generator-cli, dart_dio, typescript-fetch)."
