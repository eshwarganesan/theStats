import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { resendConfirmation, signUp } from "@/lib/auth";
import { authErrorText } from "@/lib/authErrors";

/**
 * Create an account with email and password, through the same API (and
 * throttle) as web. Supabase then emails a confirmation link, which opens
 * in the browser; after that the account signs in here as usual.
 */
export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const canSubmit = email.trim() !== "" && password !== "" && !pending;
  const toSignIn = () => (router.canGoBack() ? router.back() : router.replace("/sign-in"));

  async function onSubmit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const address = email.trim();
    const result = await signUp(address, password);
    setPending(false);
    if (result.ok) setSentTo(address);
    else setError(authErrorText(result));
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-full max-w-md gap-6">
            {sentTo ? (
              <CheckEmail email={sentTo} onSignIn={toSignIn} />
            ) : (
              <>
                <View className="gap-2">
                  <Text className="text-4xl font-bold text-ink">theStats</Text>
                  <Text className="text-base text-ink-muted">Create your account.</Text>
                </View>

                <View className="gap-4">
                  <TextField
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    editable={!pending}
                  />
                  <TextField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="go"
                    onSubmitEditing={onSubmit}
                    editable={!pending}
                  />
                </View>

                {error ? (
                  <Text accessibilityRole="alert" className="text-sm text-danger">
                    {error}
                  </Text>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create account"
                  accessibilityState={{ disabled: !canSubmit, busy: pending }}
                  disabled={!canSubmit}
                  onPress={onSubmit}
                  className="items-center rounded-lg bg-accent py-3 disabled:opacity-50"
                >
                  {pending ? (
                    <ActivityIndicator color="#0B0B0D" />
                  ) : (
                    <Text className="text-base font-semibold text-surface">Create account</Text>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Sign in"
                  onPress={toSignIn}
                  className="items-center py-2"
                >
                  <Text className="text-sm text-ink-muted">
                    Already have an account? <Text className="text-accent">Sign in</Text>
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Shown once the account exists: confirm the email, then sign in. */
function CheckEmail({ email, onSignIn }: { email: string; onSignIn: () => void }) {
  const [resending, setResending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onResend() {
    setResending(true);
    setNote(null);
    const result = await resendConfirmation(email);
    setResending(false);
    setNote(result.ok ? "Sent again. Check your inbox." : authErrorText(result));
  }

  return (
    <View accessibilityRole="summary" className="gap-5">
      <Text accessibilityRole="header" className="text-3xl font-bold text-ink">
        Check your email
      </Text>
      <Text className="text-base leading-relaxed text-ink-muted">
        We sent a confirmation link to <Text className="text-ink">{email}</Text>. Open it to
        confirm your account, then come back here and sign in.
      </Text>
      <Button label="Back to sign in" variant="primary" size="lg" onPress={onSignIn} />
      <View className="items-center gap-2">
        <Button
          label="Resend email"
          size="sm"
          variant="ghost"
          disabled={resending}
          onPress={onResend}
        />
        {note ? <Text className="text-sm text-ink-muted">{note}</Text> : null}
      </View>
    </View>
  );
}
