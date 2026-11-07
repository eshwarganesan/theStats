import { Alert } from "react-native";

import { confirm } from "./confirm";

afterEach(() => jest.restoreAllMocks());

describe("confirm", () => {
  it("resolves true for the confirm button and false for Cancel", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementationOnce((_t, _m, buttons) => {
      buttons?.[1]?.onPress?.();
    });
    await expect(confirm("Delete?", "Gone for good.", "Delete", "destructive")).resolves.toBe(true);
    expect(alert).toHaveBeenCalledWith(
      "Delete?",
      "Gone for good.",
      [
        expect.objectContaining({ text: "Cancel", style: "cancel" }),
        expect.objectContaining({ text: "Delete", style: "destructive" }),
      ],
      expect.objectContaining({ cancelable: true }),
    );

    alert.mockImplementationOnce((_t, _m, buttons) => buttons?.[0]?.onPress?.());
    await expect(confirm("Delete?", "Gone for good.", "Delete")).resolves.toBe(false);
  });

  it("resolves false when the alert is dismissed", async () => {
    jest
      .spyOn(Alert, "alert")
      .mockImplementationOnce((_t, _m, _b, options) => options?.onDismiss?.());
    await expect(confirm("Leave?", "", "Leave")).resolves.toBe(false);
  });
});
