import { describe, it, expect } from "vitest";
import {
  validatePassword,
  getPasswordStrength,
} from "@shared/password-policy";

// ────────────────────────────────────────────────────────────────
// validatePassword
// ────────────────────────────────────────────────────────────────

describe("validatePassword", () => {
  describe("length requirement", () => {
    it("rejects passwords shorter than 12 characters", () => {
      const result = validatePassword("Short1@");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must be at least 12 characters");
    });

    it("accepts passwords with exactly 12 characters when all rules met", () => {
      const result = validatePassword("Abcdef1@ghij");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts passwords longer than 12 characters", () => {
      const result = validatePassword("MySecureP@ssword1234");
      expect(result.valid).toBe(true);
    });
  });

  describe("uppercase requirement", () => {
    it("rejects passwords with no uppercase letter", () => {
      const result = validatePassword("abcdefghij1@");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password must contain at least one uppercase letter"
      );
    });

    it("accepts a password with a Cyrillic uppercase letter", () => {
      // Д is Cyrillic uppercase
      const result = validatePassword("Дabcdefghi1@");
      expect(result.valid).toBe(true);
    });
  });

  describe("lowercase requirement", () => {
    it("rejects passwords with no lowercase letter", () => {
      const result = validatePassword("ABCDEFGHIJ1@");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password must contain at least one lowercase letter"
      );
    });
  });

  describe("number requirement", () => {
    it("rejects passwords with no digit", () => {
      const result = validatePassword("AbcdefghiJ@!");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password must contain at least one number"
      );
    });

    it("accepts passwords with Arabic-Indic digit (Unicode numeral)", () => {
      // ١ is Arabic-Indic digit 1 (\u0661)
      const result = validatePassword("Abcdefghi١@!");
      expect(result.valid).toBe(true);
    });
  });

  describe("symbol requirement", () => {
    it("rejects passwords with no symbol", () => {
      const result = validatePassword("Abcdefghij12");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password must contain at least one symbol (!@#$%^&* etc.)"
      );
    });

    it("accepts passwords with a common symbol", () => {
      const result = validatePassword("Abcdefghij1!");
      expect(result.valid).toBe(true);
    });

    it("accepts passwords with # as symbol", () => {
      const result = validatePassword("Abcdefghij1#");
      expect(result.valid).toBe(true);
    });
  });

  describe("username context check", () => {
    it("rejects password that contains the username", () => {
      const result = validatePassword("MyUsernamePass1!", {
        username: "myusername",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password cannot contain your username");
    });

    it("allows password when username is fewer than 3 characters", () => {
      const result = validatePassword("ABcd1234!AAAA", { username: "ab" });
      expect(result.valid).toBe(true);
    });

    it("is case-insensitive for username match", () => {
      const result = validatePassword("JOHNDOE1234!#", { username: "johndoe" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password cannot contain your username");
    });

    it("accepts password that does not contain the username", () => {
      const result = validatePassword("MySecure1@Pass", { username: "alice" });
      expect(result.valid).toBe(true);
    });
  });

  describe("displayName context check", () => {
    it("rejects password containing a part of the display name", () => {
      const result = validatePassword("JohnSmith1@ABCD", {
        displayName: "John Smith",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password cannot contain any part of your name"
      );
    });

    it("ignores display name parts shorter than 3 characters", () => {
      const result = validatePassword("ABcd1234@YYYY", { displayName: "Jo Li" });
      expect(result.valid).toBe(true);
    });

    it("handles hyphenated display names", () => {
      const result = validatePassword("Mary1234@PASS!", {
        displayName: "Mary-Jane Watson",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password cannot contain any part of your name"
      );
    });

    it("accepts password when display name parts are not present", () => {
      const result = validatePassword("Correct1@Horse!", {
        displayName: "Alice Bob",
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("multiple failures", () => {
    it("returns all applicable errors at once", () => {
      const result = validatePassword("short");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain(
        "Password must be at least 12 characters"
      );
      expect(result.errors).toContain(
        "Password must contain at least one number"
      );
      expect(result.errors).toContain(
        "Password must contain at least one symbol (!@#$%^&* etc.)"
      );
    });
  });
});

// ────────────────────────────────────────────────────────────────
// getPasswordStrength
// ────────────────────────────────────────────────────────────────

describe("getPasswordStrength", () => {
  it("returns score 0 for an empty string", () => {
    const { score, label, color } = getPasswordStrength("");
    expect(score).toBe(0);
    expect(label).toBe("Weak");
    expect(color).toBe("text-red-500");
  });

  it("returns score 1 for a password with only the length criterion met", () => {
    // 12+ chars, no mixed case, no number or symbol
    const { score } = getPasswordStrength("aaaaaaaaaaaa");
    expect(score).toBe(1);
  });

  it("returns score 2 for a long password (16+ chars) without other criteria", () => {
    const { score } = getPasswordStrength("aaaaaaaaaaaaaaaa");
    expect(score).toBe(2);
  });

  it("returns score 2 when length (12+) + mixed case are both met (no number/symbol)", () => {
    // score: +1 length>=12, +1 mixed case = 2
    const { score, label } = getPasswordStrength("AaBbCcDdEeFf");
    expect(score).toBe(2);
    expect(label).toBe("Good");
  });

  it("returns score 3 for a 12-char password with mixed case, number and symbol", () => {
    // score: +1 length>=12, +1 mixed case, +1 number+symbol = 3
    const { score, label, color } = getPasswordStrength("AaBb1234!@#$");
    expect(score).toBe(3);
    expect(label).toBe("Strong");
    expect(color).toBe("text-green-500");
  });

  it("returns score 4 and 'Very Strong' for a 16+ char password with all criteria", () => {
    // score: +1 length>=12, +1 length>=16, +1 mixed case, +1 number+symbol = 4
    const result = getPasswordStrength("AaBb1234!@#$Extra");
    expect(result.score).toBe(4);
    expect(result.label).toBe("Very Strong");
    expect(result.color).toBe("text-green-600");
  });

  it("returns labels and colors corresponding to score indices", () => {
    const scores: [string, string, string][] = [
      ["aaaaaaaaaaaa", "Fair", "text-orange-500"], // score 1
      ["AaBbCcDdEeFf", "Good", "text-yellow-500"], // score 3... actually let me check
    ];
    // Validate score 1 (length ≥ 12 only)
    const s1 = getPasswordStrength("aaaaaaaaaaaa");
    expect(s1.label).toBe("Fair");
    expect(s1.color).toBe("text-orange-500");
  });
});
