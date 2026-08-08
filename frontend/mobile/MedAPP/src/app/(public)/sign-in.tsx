// Route file is thin — connects the screen component to the router outlet.
//
// `onSuccess` spends the pending deep link if there is one. A recipient who
// taps a shared post without a session is sent here by `(app)/_layout.tsx`,
// which stashed the destination on the way past; without this they would sign
// in and land on Home, which is the failure the share was meant to fix. No
// link, or a link this session already spent, falls through to `/(app)` — the
// behaviour every other sign-in has always had.

import { router, type Href } from "expo-router";
import { SignInScreen } from "@/features/auth/SignInScreen";
import { takePendingLink } from "@/lib/pending-link";

export default function SignInRoute() {
  return (
    <SignInScreen
      onSuccess={() => {
        const next = takePendingLink();
        router.replace((next ?? "/(app)") as Href);
      }}
    />
  );
}
