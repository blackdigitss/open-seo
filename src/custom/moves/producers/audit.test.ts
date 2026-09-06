import { describe, expect, it } from "vitest";
import { riskForIssue, verifyForIssue } from "./rules";

describe("riskForIssue", () => {
  it("treats tag rewrites as safe", () => {
    expect(riskForIssue("missing-title", false)).toBe("safe");
    expect(riskForIssue("meta-description-too-short", false)).toBe("safe");
    expect(riskForIssue("images-missing-alt", false)).toBe("safe");
  });

  it("never auto-applies anything that can drop a page from the index", () => {
    for (const issue of [
      "noindex-page",
      "canonical-conflict",
      "canonicalized-page",
      "redirect-chain",
      "redirect-loop",
      "broken-internal-link",
      "server-error",
    ]) {
      expect(riskForIssue(issue, false)).toBe("risky");
    }
  });

  it("sends even a safe fix for approval on a money page", () => {
    expect(riskForIssue("missing-title", true)).toBe("risky");
  });
});

describe("verifyForIssue", () => {
  it("checks the tag it asked for", () => {
    expect(verifyForIssue("missing-title")).toMatchObject({ kind: "title" });
    expect(verifyForIssue("missing-meta-description")).toMatchObject({
      kind: "meta_description",
    });
    expect(verifyForIssue("images-missing-alt")).toMatchObject({
      kind: "images_alt",
      maxMissing: 0,
    });
  });

  it("expects nothing verifiable for issues with no single signal", () => {
    expect(verifyForIssue("thin-content")).toEqual({ kind: "none" });
  });
});
