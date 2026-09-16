import { useEffect } from "react";
import { BackHandler, ScrollView } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { DetailShell } from "@/components/shell";
import { Button, ErrorPanel, InfoCallout, SkeletonCard } from "@/components/ui";
import { useSessionScope } from "@/hooks/use-session-scope";
import { careApi } from "@/features/care/api";
import { bookingApi, validInstant } from "./api";
import { BookingConfirmationDetails } from "./BookingConfirmationDetails";
import { ApiError } from "@/types/api";
import { confirmationTime } from "./confirmation-time";

function close() {
  router.replace("/(app)" as Href);
}
function BookingFrame({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, []);
  return (
    <DetailShell title="Appointment" backIcon="close" onBack={close}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {children}
        <Button
          label="View My Appointments"
          variant="outline"
          onPress={() => router.replace("/(app)/appointments" as Href)}
        />
      </ScrollView>
    </DetailShell>
  );
}
export function BookingConfirmedScreen() {
  const params = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const scope = useSessionScope();
  const id = (Array.isArray(params.bookingId) ? params.bookingId[0] : params.bookingId)?.trim();
  return (
    <SavedBooking
      key={`${scope.owner}:${scope.revision}:${id}`}
      id={id === "undefined" ? undefined : id}
      scope={scope}
    />
  );
}
function SavedBooking({ id, scope }: { id?: string; scope: ReturnType<typeof useSessionScope> }) {
  const query = useQuery({
    queryKey: ["appointments", "detail", scope.owner, scope.revision, id],
    enabled: !!id && !!scope.owner,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30_000,
    queryFn: async ({ signal }) => {
      const booking = await bookingApi.getBooking(id!, {
        signal,
        isSessionCurrent: scope.isCurrent,
      });
      if (
        booking.bookingId !== id ||
        !booking.doctorId ||
        !["booked", "cancelled"].includes(booking.status) ||
        !validInstant(booking.startsAtIso) ||
        !validInstant(booking.endsAtIso) ||
        Date.parse(booking.endsAtIso) <= Date.parse(booking.startsAtIso)
      )
        throw new ApiError("Invalid appointment response.", 502);
      return booking;
    },
  });
  const booking = query.isError ? undefined : query.data;
  const doctor = useQuery({
    queryKey: ["care", "booking-doctor", scope.owner, scope.revision, booking?.doctorId],
    enabled: !!booking,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const profile = await careApi.getDoctor(booking!.doctorId, {
        signal,
        isSessionCurrent: scope.isCurrent,
      });
      if (profile.doctorId !== booking!.doctorId)
        throw new ApiError("Clinician response did not match this appointment.", 502);
      return profile;
    },
  });
  if (!id)
    return (
      <BookingFrame>
        <InfoCallout tone="info">
          Open an appointment from My Appointments to see its saved details.
        </InfoCallout>
      </BookingFrame>
    );
  if (!scope.owner)
    return (
      <BookingFrame>
        <InfoCallout tone="info">Sign in to view this appointment.</InfoCallout>
      </BookingFrame>
    );
  if (query.isLoading)
    return (
      <BookingFrame>
        <SkeletonCard shape="provider-card" count={2} />
      </BookingFrame>
    );
  if (query.isError || !booking)
    return (
      <BookingFrame>
        <ErrorPanel
          title="Unable to load appointment"
          body="The appointment may be unavailable for this account, or your connection may be offline. Try again or open My Appointments."
          retry={() => query.refetch()}
          retryAccessibilityLabel="Retry loading appointment"
        />
      </BookingFrame>
    );
  const times = confirmationTime(booking.startsAtIso, booking.endsAtIso);
  const isPast = Date.parse(booking.endsAtIso) <= Date.now();
  const profile = doctor.isError ? undefined : doctor.data;
  return (
    <BookingConfirmationDetails
      key={`${booking.bookingId}:${booking.doctorId}:${booking.startsAtIso}:${booking.endsAtIso}:${booking.status}:${isPast}`}
      isCurrent={scope.isCurrent}
      status={booking.status}
      isPast={isPast}
      refreshing={query.isRefetching || doctor.isRefetching}
      onRefresh={() => {
        void query.refetch();
        void doctor.refetch();
      }}
      providerNotice={
        doctor.isError ? (
          <ErrorPanel
            title="Clinician details unavailable"
            body="Your saved appointment is shown below. Try again to load the clinician's name."
            retry={() => doctor.refetch()}
            retryAccessibilityLabel="Retry loading appointment clinician"
          />
        ) : undefined
      }
      params={{
        practitionerName: profile?.name,
        practitionerSpecialty: profile?.specialty ?? undefined,
        practitionerAvatar: profile?.avatarUri || undefined,
        ...times,
        mode: booking.mode,
        type: booking.mode === "video" ? "Video consultation" : "In-person appointment",
        startsAtIso: booking.startsAtIso,
        endsAtIso: booking.endsAtIso,
        reason: booking.reason,
        notes: booking.notes,
      }}
    />
  );
}
