// Specialist — Social Profile screen — translated from the Stitch HTML
// "Practitioner Profile" design.
//
// Distinct from PractitionerTelehealthProfileScreen, which will handle
// appointment booking / consultation flow.
//
// Entry points:
//   - Explore screen  → practitioner card  → "View Profile"
//   - Community screen → post / mention     → "View Profile"
//
// Route: app/(app)/practitioner-social-profile.tsx
// Params: { id?: string } — practitioner ID for future API lookup.
//         Seed data stands in until the practitioner service endpoint ships.
//
// Translation calls:
//   - backdrop-blur header   → the shared DetailAppBar; no blur, no shadow.
//   - bg-gradient-to-r cover → bg-primary-container + two decorative
//     positioned View blobs (RN can't cheaply composite a CSS gradient).
//   - -mt-20 profile card    → marginTop: -80 in RN style.
//   - hover:* / group-hover  → dropped (no hover on RN).
//   - Desktop nav drawer     → dropped (mobile-only screen).
//   - line-clamp-3 (mobile)  → always show full bio; no clamp on RN.
//   - Tab state              → useState; Reviews is the default active tab.
//   - Star distribution bars → View-based progress bars (fixed seed widths).
//   - Material Symbols       → MaterialIcons nearest equivalents.
//   - verified (filled)      → check-circle.
//   - star (filled)          → star / star-half / star-border.
//   - thumb_up / thumb_down  → thumb-up / thumb-down.
//
// Read https://docs.expo.dev/versions/v55.0.0/ before adding any
// expo-* APIs here.

import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, type Href } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DetailShell } from "@/components/shell";
import { Card, Icon } from "@/components/ui";
import { useTokenColor } from "@/lib/tokens";

type Tab = "posts" | "certifications" | "reviews" | "services";

/**
 * The scroll reserve, after the forbidden `<BottomNav>` was deleted.
 *
 * It used to be 120 = the nav's 80 outer height (8 + 48 + 24, per BottomNav.tsx)
 * + 40 under the "Load More Reviews" button. Nothing is pinned to the bottom of
 * this screen and DetailShell claims the bottom inset, so only the 40 remains.
 */
const SCROLL_RESERVE = 40;

// ---------------------------------------------------------------------------
// Seed data — mirrors the Stitch comp. Replace with an API call once the
// practitioner service exposes GET /v1/practitioners/:id.
// ---------------------------------------------------------------------------

interface Review {
  id: string;
  initials: string;
  avatarTint: "secondary" | "tertiary";
  name: string;
  rating: number; // 1–5
  timeAgo: string;
  body: string;
  helpfulCount: number;
}

const SEED_REVIEWS: Review[] = [
  {
    id: "r1",
    initials: "JS",
    avatarTint: "secondary",
    name: "James S.",
    rating: 5,
    timeAgo: "2 days ago",
    body: "Dr. Jenkins is incredibly knowledgeable and patient. She took the time to understand my lifestyle and helped me create a realistic nutrition plan that I can actually stick to.",
    helpfulCount: 12,
  },
  {
    id: "r2",
    initials: "ML",
    avatarTint: "tertiary",
    name: "Maria L.",
    rating: 4,
    timeAgo: "1 week ago",
    body: "Great experience. The gut health advice was life-changing. Highly recommend if you are struggling with energy levels.",
    helpfulCount: 4,
  },
];

// Seed widths match the Stitch design comp (5★ dominant).
const STAR_BARS: { stars: number; pct: number }[] = [
  { stars: 5, pct: 85 },
  { stars: 4, pct: 10 },
  { stars: 3, pct: 2 },
  { stars: 2, pct: 2 },
  { stars: 1, pct: 1 },
];

const TABS: { key: Tab; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "certifications", label: "Certifications" },
  { key: "reviews", label: "Reviews" },
  { key: "services", label: "Services" },
];

const AVATAR_URI =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAAQEW_OTW8Fk8Qcd162NLIhh9CCcSD-NVa69hFXrwcaeZdcrSnPNuESPWE2-XEGxW8KdZMNALoF3IBnYEEm4EQBJwxvWYZ1SVbp7TgMxOVxB9kvs88lqjaNey0yHNImHIbO-W-R_240ozvCNwpNg8Y7QphuKfQxSZEi_eU4NAPgYeoUkJDfuX4EHhCrqgsLEEU-yGy0R7hAFJ0ORK9rMQwsjey9_pl2rK05Fds3cfg4KMKZI_1BB4zDR9dxR3dGwZId9BU1VUQlO5x";

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function PractitionerSocialProfileScreen() {
  const [activeTab, setActiveTab] = useState<Tab>("reviews");
  // The bar's overflow glyph, by token name rather than the `#3d4947` the
  // hand-rolled bar froze (the LIGHT value of color/on-surface-variant).
  const mutedGlyph = useTokenColor("on-surface-variant");

  return (
    // App bar — the shared detail bar (Figma 193:120), now via DetailShell.
    // FLAGGED (unchanged by this pass): the hand-rolled bar set "MedApp" as
    // `<Text>` — the wordmark re-typeset (docs/BRAND.md §Logo rules), and
    // 193:120 forbids a logo on a detail bar. Retitled to the screen's role; the
    // copy needs a designer/PO call. The practitioner's own name is not a param
    // here (only reviewer names are), so it cannot go in the title today.
    <DetailShell
      title="Provider Profile"
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More options"
          className="h-full w-full items-center justify-center rounded-full active:opacity-70"
        >
          <Icon chrome="more-vert" size={24} color={mutedGlyph} />
        </Pressable>
      }
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: SCROLL_RESERVE }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover area — gradient simulated with primary-container + decorative blobs */}
        <View
          className="h-48 w-full overflow-hidden bg-primary-container"
          style={{ borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}
        >
          <View
            style={{
              position: "absolute",
              top: -40,
              right: -40,
              height: 200,
              width: 200,
              borderRadius: 100,
              backgroundColor: "rgba(255,255,255,0.12)",
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: -30,
              left: -30,
              height: 140,
              width: 140,
              borderRadius: 70,
              backgroundColor: "rgba(0,131,120,0.25)",
            }}
          />
        </View>

        {/* Profile card — overlaps the cover via negative marginTop */}
        <View className="px-md" style={{ marginTop: -80 }}>
          {/* The shared Card: `card-surface` + a full-strength
              `outline-variant` hairline + `radius/24`, and NO drop shadow
              (docs/BRAND.md §Elevation). It still overlaps the cover by
              -80px, so the overlap — not a blur — is what lifts it. */}
          <Card>
            {/* Avatar row */}
            <View className="flex-row items-end gap-md mb-md">
              {/* Avatar with verified badge */}
              <View>
                {/* The 4px surface-coloured ring is the avatar's separation
                    against the cover; the old blur was a second signal. */}
                <View className="h-28 w-28 overflow-hidden rounded-full border-4 border-surface-container-lowest">
                  <Image
                    source={{ uri: AVATAR_URI }}
                    className="h-full w-full"
                    accessibilityLabel="Dr. Sarah Jenkins"
                  />
                </View>
                <View className="absolute bottom-1 right-1 rounded-full bg-surface-container-lowest p-xs">
                  <MaterialIcons name="check-circle" size={20} color="#00685f" />
                </View>
              </View>

              {/* Stats */}
              <View className="flex-1 flex-row justify-center gap-lg pb-sm">
                <View className="items-center">
                  <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
                    12k
                  </Text>
                  <Text className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
                    Followers
                  </Text>
                </View>
                <View className="w-px bg-surface-container-highest" />
                <View className="items-center">
                  <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
                    4.9
                  </Text>
                  <Text className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
                    Rating
                  </Text>
                </View>
              </View>
            </View>

            {/* Name + specialty + badge */}
            <View className="flex-row items-start justify-between mb-sm">
              <View className="flex-1 mr-sm">
                <Text className="font-headline-md text-on-surface" style={{ fontSize: 22 }}>
                  Dr. Sarah Jenkins
                </Text>
                <Text className="font-label-md text-label-md text-primary mt-xs">
                  Clinical Nutritionist, RDN
                </Text>
              </View>
              <View className="rounded-full bg-primary-fixed/20 px-sm py-xs">
                <Text
                  className="font-label-sm text-label-sm text-primary-container"
                  style={{ fontSize: 11 }}
                >
                  Accepting Patients
                </Text>
              </View>
            </View>

            {/* Bio */}
            <Text className="font-body-md text-body-md text-on-surface-variant mb-md">
              Passionate about holistic health and functional nutrition. I help individuals
              optimize their energy, manage chronic conditions, and build sustainable
              relationships with food. With over 10 years of clinical experience, I believe
              in evidence-based, personalized care that fits your lifestyle.
            </Text>

            {/* Action buttons */}
            <View className="flex-row gap-sm">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Follow Dr. Sarah Jenkins"
                className="flex-1 flex-row items-center justify-center gap-xs rounded-lg bg-primary py-sm active:scale-[0.98]"
              >
                <MaterialIcons name="person-add" size={18} color="#ffffff" />
                <Text className="font-label-md text-label-md text-white">Follow</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send private message"
                className="flex-1 flex-row items-center justify-center gap-xs rounded-lg border border-surface-container-highest bg-surface-container py-sm active:scale-[0.98]"
                onPress={() => router.push("/(app)/chat-thread" as Href)}
              >
                <MaterialIcons name="chat" size={18} color="#171d1c" />
                <Text className="font-label-md text-label-md text-on-surface">Message</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More options"
                className="items-center justify-center rounded-lg border border-surface-container-highest bg-surface-container px-md py-sm active:scale-95"
              >
                <MaterialIcons name="more-horiz" size={20} color="#171d1c" />
              </Pressable>
            </View>
          </Card>
        </View>

        {/* Tab bar */}
        <View className="mt-lg border-b border-surface-container-highest px-md">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 24 }}
          >
            {TABS.map((t) => (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: activeTab === t.key }}
                onPress={() => setActiveTab(t.key)}
                className="pb-sm"
                style={{
                  borderBottomWidth: 2,
                  borderBottomColor: activeTab === t.key ? "#00685f" : "transparent",
                }}
              >
                <Text
                  className="font-label-md text-label-md"
                  style={{ color: activeTab === t.key ? "#00685f" : "#3d4947" }}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Tab content */}
        <View className="mt-lg px-md gap-md">
          {activeTab === "reviews" ? (
            <ReviewsTab />
          ) : (
            <TabPlaceholder tab={activeTab} />
          )}
        </View>
      </ScrollView>
    </DetailShell>
  );
}

// ---------------------------------------------------------------------------
// Reviews tab
// ---------------------------------------------------------------------------

function ReviewsTab() {
  return (
    <View className="gap-md">
      {/* Rating summary */}
      <Card>
        <View className="flex-row items-center gap-lg">
          {/* Big number + stars */}
          <View className="items-center">
            <Text
              className="font-headline-md text-on-surface"
              style={{ fontSize: 48, lineHeight: 52 }}
            >
              4.9
            </Text>
            <View className="flex-row gap-xs mt-xs">
              <MaterialIcons name="star" size={16} color="#00685f" />
              <MaterialIcons name="star" size={16} color="#00685f" />
              <MaterialIcons name="star" size={16} color="#00685f" />
              <MaterialIcons name="star" size={16} color="#00685f" />
              <MaterialIcons name="star-half" size={16} color="#00685f" />
            </View>
            <Text className="font-label-sm text-label-sm text-on-surface-variant mt-xs">
              842 Reviews
            </Text>
          </View>
          {/* Distribution bars */}
          <View className="flex-1 gap-sm">
            {STAR_BARS.map(({ stars, pct }) => (
              <View key={stars} className="flex-row items-center gap-sm">
                <Text className="font-label-sm text-label-sm text-on-surface-variant w-4">
                  {stars}
                </Text>
                <View className="flex-1 h-2 rounded-full bg-surface-container overflow-hidden">
                  <View
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {/* Individual review cards */}
      {SEED_REVIEWS.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}

      {/* Load more */}
      <View className="items-center pb-lg">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Load more reviews"
          className="rounded-full border border-surface-container-highest bg-surface-container-lowest px-xl py-sm active:scale-95"
        >
          <Text className="font-label-md text-label-md text-on-surface">Load More Reviews</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const avatarColors: Record<Review["avatarTint"], { bg: string; fg: string }> = {
    secondary: { bg: "#d5e3fc", fg: "#57657a" },
    tertiary: { bg: "#2170e4", fg: "#fefcff" },
  };
  const { bg, fg } = avatarColors[review.avatarTint];

  return (
    <Card>
      {/* Header row */}
      <View className="flex-row items-start justify-between mb-sm">
        <View className="flex-row items-center gap-sm">
          <View
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: bg }}
          >
            <Text className="font-label-md text-label-md" style={{ color: fg }}>
              {review.initials}
            </Text>
          </View>
          <View>
            <View className="flex-row items-center gap-xs mb-xs">
              <Text className="font-label-md text-label-md text-on-surface">{review.name}</Text>
              <View className="flex-row items-center gap-xs rounded-full bg-primary-fixed/20 px-xs py-xs">
                <MaterialIcons name="check-circle" size={10} color="#00685f" />
                <Text style={{ fontSize: 10, color: "#00685f", fontWeight: "600" }}>
                  Verified
                </Text>
              </View>
            </View>
            <View className="flex-row gap-xs">
              {Array.from({ length: 5 }).map((_, i) => (
                <MaterialIcons
                  key={i}
                  name={i < review.rating ? "star" : "star-border"}
                  size={14}
                  color="#00685f"
                />
              ))}
            </View>
          </View>
        </View>
        <Text className="font-label-sm text-label-sm text-on-surface-variant">
          {review.timeAgo}
        </Text>
      </View>

      {/* Body */}
      <Text className="font-body-md text-body-md text-on-surface-variant mb-md">
        {review.body}
      </Text>

      {/* Helpful? */}
      <View className="flex-row items-center gap-md border-t border-surface-container pt-sm">
        <Text className="font-label-sm text-label-sm text-on-surface-variant">
          Was this helpful?
        </Text>
        <View className="flex-row gap-sm">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark as helpful. Currently ${review.helpfulCount} people found this helpful`}
            className="flex-row items-center gap-xs active:scale-95"
          >
            <MaterialIcons name="thumb-up" size={16} color="#3d4947" />
            <Text className="font-label-sm text-label-sm text-on-surface-variant">
              Yes ({review.helpfulCount})
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark as not helpful"
            className="flex-row items-center gap-xs active:scale-95"
          >
            <MaterialIcons name="thumb-down" size={16} color="#3d4947" />
            <Text className="font-label-sm text-label-sm text-on-surface-variant">No</Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Placeholder for tabs not yet built.
// ---------------------------------------------------------------------------

function TabPlaceholder({ tab }: { tab: Tab }) {
  const labels: Record<Tab, string> = {
    posts: "Posts",
    certifications: "Certifications",
    services: "Services",
    reviews: "Reviews",
  };
  return (
    <View className="items-center justify-center py-xl gap-sm">
      <MaterialIcons name="construction" size={40} color="#bcc9c6" />
      <Text className="font-label-md text-label-md text-on-surface-variant">
        {labels[tab]} coming soon
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Elevation — nothing on this screen floats.
//
// `cardShadow`, `profileCardShadow`, `avatarShadow` and `primaryBtnShadow` are
// all gone, along with the earlier `appBarShadow`. Every surface they were
// applied to is a card, an avatar, a badge or an in-flow button — none of them
// the sheet/menu/dialog/toast/FAB role that docs/BRAND.md §Elevation scopes the
// sanctioned `0 1px 2px` / `0 2px 6px` pair to. Separation is surface tone plus
// the `outline-variant` hairline, which the shared `Card` now supplies.
// ---------------------------------------------------------------------------
