import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { signIn, type SignInResult } from "@/lib/auth";

type Failure = Extract<SignInResult, { ok: false }>;

function errorText(failure: Failure): string {
  if (failure.code === "rate_limited" && failure.retryAfterSeconds !== undefined) {
    const s = failure.retryAfterSeconds;
    return `Too many attempts. Try again in ${s} second${s === 1 ? "" : "s"}.`;
  }
  if (failure.code === "email_unconfirmed") {
    return "Please confirm your email before signing in. Check your inbox for the link.";
  }
  return failure.message;
}

/**
 * Email + password sign-in. On success the session listener in the root
 * layout swaps this screen for the app; there is no manual navigation.
 */
export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !pending;

  async function onSubmit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const result = await signIn(email, password);
    if (!result.ok) {
      setError(errorText(result));
      setPending(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-full max-w-md gap-6">
            <View className="gap-2">
              <Text className="text-4xl font-bold text-ink">theStats</Text>
              <Text className="text-base text-ink-muted">Sign in to keep score.</Text>
            </View>

            <View className="gap-4">
              <Field label="Email">
                <TextInput
                  testID="email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  editable={!pending}
                  className="rounded-lg border border-surface-border bg-surface-elevated px-4 py-3 text-base text-ink"
                />
              </Field>
              <Field label="Password">
                <TextInput
                  testID="password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={onSubmit}
                  editable={!pending}
                  className="rounded-lg border border-surface-border bg-surface-elevated px-4 py-3 text-base text-ink"
                />
              </Field>
            </View>

            {error ? (
              <Text accessibilityRole="alert" className="text-sm text-danger">
                {error}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy: pending }}
              disabled={!canSubmit}
              onPress={onSubmit}
              className="items-center rounded-lg bg-accent py-3 disabled:opacity-50"
            >
              {pending ? (
                <ActivityIndicator color="#0B0B0D" />
              ) : (
                <Text className="text-base font-semibold text-surface">Sign in</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs uppercase tracking-widest text-ink-muted">{label}</Text>
      {children}
    </View>
  );
}
