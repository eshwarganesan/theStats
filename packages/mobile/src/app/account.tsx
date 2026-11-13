import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DELETE_ACCOUNT_COPY } from "@thestats/app";

import { DeleteAccountSheet } from "@/components/account/DeleteAccountSheet";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { signOut } from "@/lib/auth";
import { useSession } from "@/lib/session";

/**
 * Account: which account is signed in, signing out, and a way to delete
 * the account inside the app (feature 018-account-deletion, FR-016), as
 * the App Store requires. The same order as web's account page. One tap
 * from Home, through the profile button in its header.
 */
export default function AccountScreen() {
  const { session } = useSession();
  const [deleting, setDeleting] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "left", "right"]}>
      <ScreenHeader title="Account" />
      <ScrollView contentContainerClassName="gap-8 p-6">
        <View className="gap-1">
          <Text className="text-xs uppercase tracking-widest text-ink-muted">Signed in as</Text>
          <Text className="text-base text-ink">{session?.user.email}</Text>
        </View>

        <SignOutButton />

        <View className="gap-4 rounded-lg border border-danger/50 p-5">
          <View className="gap-1">
            <Text accessibilityRole="header" className="text-lg font-bold text-danger">
              {DELETE_ACCOUNT_COPY.sectionHeading}
            </Text>
            <Text className="text-sm text-ink-muted">{DELETE_ACCOUNT_COPY.sectionText}</Text>
          </View>
          <View className="items-start">
            <Button
              label={DELETE_ACCOUNT_COPY.actionLabel}
              variant="danger"
              size="sm"
              onPress={() => setDeleting(true)}
            />
          </View>
        </View>
      </ScrollView>
      <DeleteAccountSheet visible={deleting} onClose={() => setDeleting(false)} />
    </SafeAreaView>
  );
}

function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function onPress() {
    setPending(true);
    try {
      await signOut();
    } finally {
      setPending(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      disabled={pending}
      onPress={onPress}
      className="self-start disabled:opacity-50"
    >
      <Text className="text-sm uppercase tracking-wider text-ink-dim">Sign out</Text>
    </Pressable>
  );
}
