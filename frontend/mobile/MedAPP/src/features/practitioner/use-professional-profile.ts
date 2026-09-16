import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionScope } from "@/hooks/use-session-scope";
import { useAuthStore } from "@/store/auth-store";
import { professionalApi, professionalKind } from "./professional-api";

export function useProfessionalProfile() {
  const scope = useSessionScope();
  const kind = professionalKind(scope.user);
  const isCurrent = useCallback(
    () => scope.isCurrent() && professionalKind(useAuthStore.getState().user) === kind,
    [scope.isCurrent, kind],
  );
  const queryKey = ["professional", "self", scope.owner, scope.revision, kind] as const;
  const query = useQuery({
    queryKey,
    enabled: !!scope.owner && !!kind,
    staleTime: 0,
    gcTime: 0,
    queryFn: ({ signal }) =>
      professionalApi.getSelf(kind!, scope.owner!, { signal, isSessionCurrent: isCurrent }),
  });
  return { ...scope, kind, isCurrent, queryKey, query };
}
