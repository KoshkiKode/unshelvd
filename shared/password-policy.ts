/**
 * Password policy for Unshelv'd
 * 
 * Requirements:
 * - At least 12 characters
 * - At least 1 uppercase letter (any script)
 * - At least 1 lowercase letter (any script)
 * - At least 1 number (any numeral system)
 * - At least 1 symbol/special character
 * - Cannot contain the user's name or username
 * 
 * Supports Unicode: Cyrillic, Arabic, CJK, Devanagari, etc.
 * Uses Unicode categories for case detection.
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePassword(
  password: string,
  context?: { username?: string; displayName?: string }
): PasswordValidationResult {
  const errors: string[] = [];

  // Length
  if (password.length < 12) {
    errors.push("Password must be at least 12 characters");
  }

  // Uppercase — Unicode-aware (covers Latin, Cyrillic, Greek, etc.)
  if (!/\p{Lu}/u.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  // Lowercase — Unicode-aware
  if (!/\p{Ll}/u.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  // Number — any numeral system (Latin digits, Arabic-Indic, Devanagari, etc.)
  if (!/\p{N}/u.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // Symbol — anything that's not a letter, number, or whitespace
  if (!/[^a-zA-Z0-9\s\p{L}\p{N}]|[\p{S}\p{P}]/u.test(password)) {
    errors.push("Password must contain at least one symbol (!@#$%^&* etc.)");
  }

  // Name check — case insensitive, checks against parts of name
  if (context) {
    const passwordLower = password.toLowerCase();
    
    // Check username
    if (context.username && context.username.length >= 3) {
      if (passwordLower.includes(context.username.toLowerCase())) {
        errors.push("Password cannot contain your username");
      }
    }

    // Check display name parts (first name, last name, etc.)
    if (context.displayName) {
      const nameParts = context.displayName
        .split(/[\s\-_.]+/)
        .filter(part => part.length >= 3); // Only check parts with 3+ chars
      
      for (const part of nameParts) {
        if (passwordLower.includes(part.toLowerCase())) {
          errors.push("Password cannot contain any part of your name");
          break;
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Client-side password strength meter
export function getPasswordStrength(password: string): {
  score: number; // 0-4
  label: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/\p{Lu}/u.test(password) && /\p{Ll}/u.test(password)) score++;
  if (/\p{N}/u.test(password) && /[^a-zA-Z0-9\s\p{L}\p{N}]|[\p{S}\p{P}]/u.test(password)) score++;

  const labels = ["Weak", "Fair", "Good", "Strong", "Very Strong"];
  const colors = ["text-red-500", "text-orange-500", "text-yellow-500", "text-green-500", "text-green-600"];

  return {
    score,
    label: labels[score],
    color: colors[score],
  };
}
