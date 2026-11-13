/**
 * The web sidebar's SVG glyphs (packages/web/src/components/shell),
 * drawn with views so the app needs no SVG library. The shapes keep the
 * SVGs' coordinates and stroke widths, so each one can be checked
 * against its source.
 */
import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

/** `ink` and `accent` from tailwind.config.js, the glyphs' two colours. */
export const INK = "#F5F5F4";
export const ACCENT = "#FF6B1A";

/** Web draws its sidebar glyphs at 20 px. */
const SIZE = 20;

interface GlyphProps {
  color: string;
}

/** A round-capped stroke along one axis, from (x1, y1) to (x2, y2). */
function line(x1: number, y1: number, x2: number, y2: number, stroke: number): ViewStyle {
  return {
    position: "absolute",
    left: Math.min(x1, x2) - stroke / 2,
    top: Math.min(y1, y2) - stroke / 2,
    width: Math.abs(x2 - x1) + stroke,
    height: Math.abs(y2 - y1) + stroke,
    borderRadius: stroke / 2,
  };
}

/** A stroked rectangle with rounded corners, like SVG's `<rect>`. */
function rect(x: number, y: number, width: number, height: number, rx: number, stroke: number): ViewStyle {
  return {
    position: "absolute",
    left: x - stroke / 2,
    top: y - stroke / 2,
    width: width + stroke,
    height: height + stroke,
    borderRadius: rx + stroke / 2,
    borderWidth: stroke,
  };
}

/** A stroked circle centred on (cx, cy). */
function circle(cx: number, cy: number, r: number, stroke: number): ViewStyle {
  return rect(cx - r, cy - r, r * 2, r * 2, r, stroke);
}

/** Scales a glyph drawn on web's 24-unit grid down to 20 pt. */
function Grid24({ children }: { children: ReactNode }) {
  return (
    <View style={styles.box}>
      <View style={styles.grid24}>{children}</View>
    </View>
  );
}

/** HamburgerButton's three bars, on a 20-unit grid. */
export function MenuIcon({ color }: GlyphProps) {
  return (
    <View style={styles.box}>
      {[5, 10, 15].map((y) => (
        <View key={y} style={[line(3, y, 17, y, 1.75), { backgroundColor: color }]} />
      ))}
    </View>
  );
}

/** IconGames: a scoreboard. */
export function GamesIcon({ color }: GlyphProps) {
  const fill = { backgroundColor: color };
  return (
    <Grid24>
      <View style={[rect(3, 6, 18, 12, 2, 2), { borderColor: color }]} />
      <View style={[line(12, 6, 12, 18, 2), fill]} />
      <View style={[circle(7.5, 12, 1.25, 2), { borderColor: color }]} />
      <View style={[line(15, 12, 19, 12, 2), fill]} />
      <View style={[line(17, 10, 17, 14, 2), fill]} />
    </Grid24>
  );
}

/** IconUser: a head and shoulders. */
export function UserIcon({ color }: GlyphProps) {
  return (
    <Grid24>
      <View style={[circle(12, 7, 4, 2), { borderColor: color }]} />
      {/* The shoulders, "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2": an arch open at the bottom. */}
      <View
        style={[
          rect(4, 15, 16, 6, 4, 2),
          {
            borderColor: color,
            borderBottomWidth: 0,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          },
        ]}
      />
    </Grid24>
  );
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE },
  // Centred over the 20-pt box, so scaling it about its centre fills the box.
  grid24: {
    position: "absolute",
    left: (SIZE - 24) / 2,
    top: (SIZE - 24) / 2,
    width: 24,
    height: 24,
    transform: [{ scale: SIZE / 24 }],
  },
});
