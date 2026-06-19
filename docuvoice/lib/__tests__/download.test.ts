import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "@/lib/download";

describe("downloadBlob", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:download-test");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("throws when the download response is not successful", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );

    await expect(downloadBlob("/bad-url", "test.mp3")).rejects.toThrow(
      "Failed to download",
    );
  });

  it("revoke the object URL after the download starts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(["audio"])),
      }),
    );

    const click = vi.fn();
    const remove = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(
      (tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === "a") {
          Object.defineProperty(element, "click", { value: click });
          Object.defineProperty(element, "remove", { value: remove });
        }
        return element;
      },
    );

    await downloadBlob("/api/download/123", "test.mp3");

    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download-test");
  });
});
