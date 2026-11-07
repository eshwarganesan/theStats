import { Alert } from "react-native";

/**
 * Asks a yes/no question in a native alert. Resolves true when the user
 * picks `confirmLabel`, false when they cancel or dismiss it.
 */
export function confirm(
  title: string,
  message: string,
  confirmLabel: string,
  style: "default" | "destructive" = "default",
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
