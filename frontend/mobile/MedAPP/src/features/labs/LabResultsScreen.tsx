// Lab results — `GET /v1/me/lab/results` and `/v1/me/lab/search` (lab_service).
//
// ===========================================================================
// WHY THIS SCREEN EXISTS
// ===========================================================================
// `./api.ts` was written, typed and verified live against the real gateway on
// 2026-08-07, and had ZERO callers anywhere in `src/`. A working, authorised,
// patient-scoped clinical API with nothing on the other end of it. This is the
// consumer.
//
// It is deliberately a SMALL screen. There is no Figma frame for lab results
// (docs/api/lab_service.md says so), so nothing here is a translation of a
// design and nothing pretends to be: it is the shared primitives — DetailShell,
// Card, SearchField, InfoCallout — arranged around what `LabResultOut` actually
// carries. Every field on screen is a field on the wire. A designer gate is
// owed before this is called finished, and that is a smaller debt than a
// verified clinical endpoint with no way for a patient to reach it.
//
// ===========================================================================
// WHAT THE CONTRACT FORCES, AND WHAT IS THEREFORE ABSENT
// ===========================================================================
//   * `status` and `source` are FREE TEXT (max 64), not enums. They are
//     rendered as given and never switched on exhaustively; there is no
//     status-coloured pill, because a colour per status needs a closed set.
//   * `resulted_at` is WHEN THE LAB PRODUCED THE RESULT and may be null, and it
//     is NOT the upload time. Sorting by upload time would silently reorder a
//     clinical timeline, so the sort is on `resultedAtIso` and results without
//     one are grouped separately rather than dated with a substitute.
//   * FILE CONTENT IS NEVER RETURNED. Only `file_name`, `mime_type` and
//     `external_url` come back, and there is no download endpoint. So there is
//     no "View report" button: it would have nothing to open. A result that has
//     a `fileName` says the report exists and is not retrievable here — which
//     is a fact the patient can act on, unlike a button that fails.
//   * `parsed_values` is an unvalidated free-form dict with no guaranteed units
//     or ranges. It is not wrapped by `api.ts` and it is not rendered. Drawing
//     it as structured clinical data is the one thing the contract explicitly
//     warns against.
//   * No pagination exists on the results route, so there is no paging control
//     that would silently show a prefix of a patient's history.
//
// ===========================================================================
// SEARCH FAILS SEPARATELY FROM THE LIST, AND SAYS SO
// ===========================================================================
// `/v1/me/lab/search` is backed by QDRANT — vector search, not SQL. It is a
// dependency the list and summary routes do not have, so it can be down while
// they work. A failed search therefore reports a failed SEARCH and leaves the
// full list on screen; it never reads as "you have no results", and it never
// reads as a lab outage. This is exactly the collapse this pass removed from
// the medications screen, and it is worth not re-introducing here.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any expo-* API.
// Only expo-router is used.

import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { DetailShell } from "@/components/shell";
import { Button, Card, Icon, InfoCallout, SearchField } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";
import { labApi, type LabResult } from "./api";

/**
 * `resulted_at` is nullable, and a missing date is rendered as missing.
 * Substituting `created_at` would date a clinical result with the moment
 * somebody uploaded it, which is a different fact.
 */
function resultedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Newest first, by the LAB's own timestamp. Results with no `resultedAtIso`
 * sink to the bottom rather than sorting as epoch-zero among dated ones.
 */
function byResultedAt(a: LabResult, b: LabResult): number {
  const at = a.resultedAtIso ? Date.parse(a.resultedAtIso) : Number.NEGATIVE_INFINITY;
  const bt = b.resultedAtIso ? Date.parse(b.resultedAtIso) : Number.NEGATIVE_INFINITY;
  return bt - at;
}

function ResultCard({ result }: { result: LabResult }) {
  const muted = useTokenColor("on-surface-variant");
  const resulted = resultedLabel(result.resultedAtIso);

  return (
    <Card className="p-4" testID={`lab-result-${result.id}`}>
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-md bg-primary-tint">
          <Icon name="lab-sample" size={20} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-headline-md text-headline-md text-on-surface" numberOfLines={2}>
            {result.title}
          </Text>
          {/* Free text, rendered as given. See the header. */}
          <Text className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
            {resulted ? `Resulted ${resulted} · ${result.status}` : `${result.status} · no result date recorded`}
          </Text>
        </View>
      </View>

      {result.summary ? (
        <Text className="mt-3 font-body-md text-body-md text-on-surface">{result.summary}</Text>
      ) : (
        // Absence rendered as absence. A blank line here would read as a result
        // with nothing wrong in it.
        <Text className="mt-3 font-body-md text-body-md text-on-surface-variant">
          No summary was provided with this result.
        </Text>
      )}

      {result.fileName ? (
        <View className="mt-3 flex-row items-start gap-2">
          <Icon chrome="attach-file" size={16} color={muted} />
          {/* Names the report; offers no way to open it, because there is no
              download endpoint and `external_url` is usually null. */}
          <Text className="flex-1 font-label-sm text-label-sm text-on-surface-variant">
            {`Report on file: ${result.fileName}. It cannot be opened in the app — ask the lab or your clinician for a copy.`}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

export function LabResultsScreen() {
  const spinner = useTokenColor("primary");
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const results = useQuery({
    queryKey: ["labs", "my-results"],
    queryFn: () => labApi.listMyResults(),
  });

  // A SECOND query, not a filter over the first. Filtering client-side would
  // mean holding a patient's entire lab history in memory to match a substring
  // — see the note in ./api.ts — and this route is server-side for that reason.
  const search = useQuery({
    queryKey: ["labs", "search", trimmed],
    queryFn: () => labApi.searchMyResults(trimmed),
    enabled: trimmed.length > 0,
  });

  const searching = trimmed.length > 0;
  // While a search is in flight the LIST stays on screen. Blanking it would
  // make a slow Qdrant look like an empty record.
  const shown = [...(searching && search.data ? search.data : (results.data ?? []))].sort(
    byResultedAt,
  );

  return (
    <DetailShell
      title="Lab results"
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/overview" as Href);
      }}
    >
      <ScrollView
        accessibilityLabel="Lab results"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
      >
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search your results"
          accessibilityLabel="Search your lab results"
        />

        {/* Search failing is a SEARCH failure. The list below is untouched. */}
        {searching && search.isError ? (
          <InfoCallout tone="error" testID="lab-search-error">
            Search is unavailable right now. Your results are still listed below, unfiltered.
          </InfoCallout>
        ) : null}

        {results.isPending ? (
          <View className="items-center py-12" accessibilityLabel="Loading lab results">
            <ActivityIndicator color={spinner} />
          </View>
        ) : results.isError ? (
          // A failure NEVER renders the empty state. Same rule as the
          // medications list, for the same reason.
          <View testID="lab-results-error" className="items-center gap-3 py-12">
            <Text className="font-headline-md text-headline-md text-on-surface">
              Couldn’t load your lab results
            </Text>
            <Text className="text-center font-body-md text-body-md text-on-surface-variant">
              No results are shown. This does not mean you have none.
            </Text>
            <Button
              label={results.isFetching ? "Retrying…" : "Try again"}
              variant="outline"
              fullWidth={false}
              shadow={false}
              disabled={results.isFetching}
              onPress={() => void results.refetch()}
            />
          </View>
        ) : shown.length === 0 ? (
          <View testID="lab-results-empty" className="items-center gap-2 py-12">
            <Icon name="lab-sample" size={32} />
            <Text className="font-headline-md text-headline-md text-on-surface">
              {searching ? "No results match your search" : "No lab results yet"}
            </Text>
            <Text className="text-center font-body-md text-body-md text-on-surface-variant">
              {searching
                ? "Try a different word, or clear the search to see everything."
                : "Results your clinician or lab uploads will appear here."}
            </Text>
          </View>
        ) : (
          shown.map((result) => <ResultCard key={result.id} result={result} />)
        )}
      </ScrollView>
    </DetailShell>
  );
}
