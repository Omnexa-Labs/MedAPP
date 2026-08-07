// Post detail route — thin wrapper; the screen lives in the feature module.
// Figma 1066:2025. Reached from the Community feed card, whose "read more" and
// comment count previously led nowhere.

import { PostDetailScreen } from "@/features/community/PostDetailScreen";

export default function PostDetailRoute() {
  return <PostDetailScreen />;
}
