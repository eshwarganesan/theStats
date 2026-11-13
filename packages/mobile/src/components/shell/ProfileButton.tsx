import { useRouter } from "expo-router";
import { Pressable } from "react-native";

import { INK, UserIcon } from "@/components/shell/icons";
import { cx } from "@/lib/cx";

/**
 * Opens Account: the round profile button from the foot of web's
 * sidebar (SidebarProfileIcon), which the app puts in Home's header.
 * Where it sits is the caller's job.
 */
export function ProfileButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Account"
      onPress={() => router.push("/account")}
      className={cx(
        "h-10 w-10 items-center justify-center rounded-full border border-surface-border",
        className,
      )}
    >
      <UserIcon color={INK} />
    </Pressable>
  );
}
