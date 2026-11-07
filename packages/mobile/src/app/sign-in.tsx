import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { resendConfirmation, signIn } from "@/lib/auth";
import { authErrorText } from "@/lib/authErrors";

/**
 * Email + password sign-in. On success the session listener in the root
 * layout swaps this screen for the app; there is no manual navigation.
 * An account that hasn't confirmed its email can have the link resent.
 * The form scrolls, so it stays reachable above the keyboard in landscape.
 */
export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resend, setResend] = useState<{ pending: boolean; note: string | null }>({
    pending: false,
    note: null,
  });

  const canSubmit = email.trim().length > 0 && password.length > 0 && !pending;

  async function onSubmit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    setUnconfirmed(false);
    setResend({ pending: false, note: null });
    const result = await signIn(email, password);
    if (!result.ok) {
      setError(authErrorText(result));
      setUnconfirmed(result.code === "email_unconfirmed");
      setPending(false);
    }
  }

  async function onResend() {
    setResend({ pending: true, note: null });
    const result = await resendConfirmation(email.trim());
    setResend({
      pending: false,
      note: result.ok ? "Sent. Check your inbox for the new link." : authErrorText(result),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="grow items-center justify-center px-6 py-8"
          keyboardShouldPersistTaps="handled"
        >
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
            {unconfirmed ? (
              <View className="items-start gap-2">
                <Button
                  label="Resend confirmation email"
                  size="sm"
                  variant="ghost"
                  disabled={resend.pending}
                  onPress={onResend}
                />
                {resend.note ? <Text className="text-sm text-ink-muted">{resend.note}</Text> : null}
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in"
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

            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Create an account"
              onPress={() => router.push("/sign-up")}
              className="items-center py-2"
            >
              <Text className="text-sm text-ink-muted">
                New to theStats? <Text className="text-accent">Create an account</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
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
