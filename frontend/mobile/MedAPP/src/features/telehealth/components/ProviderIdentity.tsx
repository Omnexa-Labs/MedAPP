import { Text, View, type ViewProps } from "react-native";
import { AvatarWithFallback, type AvatarTone } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface ProviderIdentityProps extends ViewProps {
  name: string;
  specialty: string;
  avatarUri?: string | null;
  initials?: string | null;
  avatarSize?: number;
  avatarTone?: AvatarTone;
  supportingText?: string;
  align?: "start" | "center";
  className?: string;
}

export function ProviderIdentity({
  name,
  specialty,
  avatarUri,
  initials,
  avatarSize = 56,
  avatarTone = "neutral",
  supportingText,
  align = "start",
  className,
  ...rest
}: ProviderIdentityProps) {
  const centered = align === "center";

  return (
    <View
      className={cn(centered ? "items-center" : "flex-row items-center gap-3", className)}
      {...rest}
    >
      <AvatarWithFallback
        uri={avatarUri}
        initials={initials}
        size={avatarSize}
        tone={avatarTone}
        label={name}
      />
      <View className={cn(centered ? "mt-3 items-center" : "min-w-0 flex-1")}>
        <Text
          className={cn(
            "font-headline-md text-headline-md text-on-surface",
            centered && "text-center",
          )}
          numberOfLines={2}
        >
          {name}
        </Text>
        <Text
          className={cn(
            "mt-1 font-body-md text-body-md text-on-surface-variant",
            centered && "text-center",
          )}
          numberOfLines={2}
        >
          {specialty}
        </Text>
        {supportingText ? (
          <Text
            className={cn(
              "mt-1 font-label-sm text-label-sm text-on-surface-variant",
              centered && "text-center",
            )}
            numberOfLines={2}
          >
            {supportingText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
