import { describe, expect, it } from "vitest";
import { buildJoinUrl, buildStageUrl } from "./roomLinks";

describe("buildJoinUrl", () => {
  it("builds a join link from the given origin and room code", () => {
    expect(buildJoinUrl("https://trivia-night.pages.dev", "BANANA")).toBe(
      "https://trivia-night.pages.dev/join?room=BANANA",
    );
  });

  it("works the same way for a local development origin", () => {
    expect(buildJoinUrl("http://localhost:5173", "BANANA")).toBe("http://localhost:5173/join?room=BANANA");
  });
});

describe("buildStageUrl", () => {
  it("builds a stage link from the given origin and room code", () => {
    expect(buildStageUrl("https://trivia-night.pages.dev", "BANANA")).toBe(
      "https://trivia-night.pages.dev/stage/BANANA",
    );
  });

  it("works the same way for a local development origin", () => {
    expect(buildStageUrl("http://localhost:5173", "BANANA")).toBe("http://localhost:5173/stage/BANANA");
  });
});
