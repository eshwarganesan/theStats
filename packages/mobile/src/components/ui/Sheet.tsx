import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

/**
 * A modal sheet with a title bar and a Close button. On iPad it opens as
 * a centred form sheet; on iPhone it slides up. Swiping it down closes it.
 */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Modal
      testID="sheet-modal"
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View testID="sheet" className="flex-1 bg-surface-elevated">
        <View className="flex-row items-center justify-between border-b border-surface-border px-5 py-4">
          <Text accessibilityRole="header" className="shrink text-lg font-bold text-ink" numberOfLines={1}>
            {title}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
            <Text className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Close</Text>
          </Pressable>
        </View>
        {/* Insets follow the keyboard, so on an iPhone in landscape a
            field and whatever sits below it can still be scrolled into view. */}
        <ScrollView
          testID="sheet-scroll"
          contentContainerClassName="gap-5 p-5"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
        {footer ? (
          <View className="flex-row justify-end gap-3 border-t border-surface-border px-5 py-4">
            {footer}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
