import { onAccountDeleted, reportAccountDeleted } from "./accountEvents";

describe("accountEvents", () => {
  it("tells every current listener, once per report", () => {
    const first = jest.fn();
    const second = jest.fn();
    const stopFirst = onAccountDeleted(first);
    const stopSecond = onAccountDeleted(second);

    reportAccountDeleted();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst();
    stopSecond();
  });

  it("stops telling a listener once it unsubscribes", () => {
    const listener = jest.fn();
    const stop = onAccountDeleted(listener);
    stop();

    reportAccountDeleted();

    expect(listener).not.toHaveBeenCalled();
  });
});
