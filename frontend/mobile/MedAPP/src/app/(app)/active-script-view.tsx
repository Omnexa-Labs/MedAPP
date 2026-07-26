// Active Script — View route. Thin wrapper; screen lives in feature.
// Pushed from the Overview screen's Active Scripts → "View Rx" action,
// carrying the script details as query params.

import { ActiveScriptViewScreen } from "@/features/scripts/ActiveScriptViewScreen";

export default function ActiveScriptViewRoute() {
  return <ActiveScriptViewScreen />;
}
