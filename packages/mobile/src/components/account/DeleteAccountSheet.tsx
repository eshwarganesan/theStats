import { useRef, useState } from "react";
import { Text, View } from "react-native";

import {
  DELETE_ACCOUNT_COPY,
  deleteAccountErrorText,
  type DeleteAccountFailure,
} from "@thestats/app";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { deleteAccount } from "@/lib/account";

/**
 * The confirmation step for deleting the account (feature
 * 018-account-deletion, contracts/confirmation-ui.md). The buttons sit in
 * the scrolling content rather than the sheet's fixed footer, so with the
 * keyboard up on an iPhone in landscape they can still be scrolled into
 * view (FR-015). On success the session ends and the auth wall replaces
 * every screen, this one included.
 */
export function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<DeleteAccountFailure | null>(null);
  const [pending, setPending] = useState(false);
  /** Bumped after each failed attempt, so the field remounts (and can refocus). */
  const [attempt, setAttempt] = useState(0);
  // A ref, not state: a double tap lands before React re-renders (FR-014).
  const inFlight = useRef(false);

  const canSubmit = password.length > 0 && !pending;

  function close() {
    // Closing mid-request would hide the outcome; the request finishes either way.
    if (inFlight.current) return;
    setPassword("");
    setFailure(null);
    onClose();
  }

  async function onDelete() {
    if (password.length === 0 || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailure(null);
    const outcome = await deleteAccount(password);
    inFlight.current = false;
    // Deleted: the session ends and the auth wall replaces this screen.
    if (outcome.kind === "deleted") return;
    setPending(false);
    if (outcome.kind === "signed-out") {
      close();
      return;
    }
    setFailure(outcome);
    setAttempt((n) => n + 1);
  }

  return (
    <Sheet visible={visible} title={DELETE_ACCOUNT_COPY.dialogTitle} onClose={close}>
      <Text className="text-base text-ink-muted">{DELETE_ACCOUNT_COPY.dialogExplanation}</Text>
      <TextField
        key={attempt}
        autoFocus={failure?.kind === "wrong-password"}
        editable={!pending}
        label={DELETE_ACCOUNT_COPY.passwordLabel}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={() => void onDelete()}
      />
      {failure ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {deleteAccountErrorText(failure)}
        </Text>
      ) : null}
      <View className="flex-row justify-end gap-3">
        <Button
          label={DELETE_ACCOUNT_COPY.cancelLabel}
          variant="ghost"
          disabled={pending}
          onPress={close}
        />
        <Button
          label={pending ? DELETE_ACCOUNT_COPY.pendingLabel : DELETE_ACCOUNT_COPY.confirmLabel}
          accessibilityLabel={DELETE_ACCOUNT_COPY.confirmAccessibleName}
          variant="danger"
          disabled={!canSubmit}
          busy={pending}
          onPress={() => void onDelete()}
        />
      </View>
    </Sheet>
  );
}
