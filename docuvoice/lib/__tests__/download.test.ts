import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "@/lib/download";

describe("downloadBlob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the URL as a blob and creates a download anchor", async () => {
    const fakeBlob = new Blob(["fake mp3 data"], { type: "audio/mpeg" });
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(fakeBlob),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const fakeObjectUrl = "blob:http://localhost/fake-uuid";
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue(fakeObjectUrl);
    const revokeObjectUrlSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

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

    vi.useFakeTimers();

    await downloadBlob("/api/download/123", "test.mp3");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const fetchUrl = fetchSpy.mock.calls[0][0] as string;
    expect(fetchUrl).toMatch(/^\/api\/download\/123\?t=\d+$/);
    expect(fetchSpy.mock.calls[0][1]).toEqual({ cache: "no-store" });
    expect(createObjectUrlSpy).toHaveBeenCalledWith(fakeBlob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);

    // Advance past the setTimeout to verify revoke is called
    vi.advanceTimersByTime(10_000);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(fakeObjectUrl);

    vi.useRealTimers();
  });

  it("throws on non-ok response", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not Found"),
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");

    await expect(
      downloadBlob("/api/download/123", "test.mp3"),
    ).rejects.toThrow("Download failed (HTTP 404): Not Found");
  });
});
