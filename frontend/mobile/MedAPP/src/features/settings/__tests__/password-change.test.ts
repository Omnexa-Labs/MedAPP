// Change-password validation.
//
// The load-bearing case is the one the SERVER would happily accept: reusing the
// current password as the new one. `change_password` only checks that the current
// password matches and that the new one meets the length policy, so submitting
// that returns 204 — and a patient who came here believing their password was
// compromised leaves believing they have rotated it, having changed nothing.
//
// The rest mirrors `ChangePasswordRequest`'s `Field(min_length=8, max_length=128)`
// so a short password becomes a field message instead of a raw 422.

import {
  EMPTY_PASSWORD_DRAFT,
  isPasswordChangeValid,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePasswordChange,
  type PasswordChangeDraft,
} from "../password-change";

function draft(overrides: Partial<PasswordChangeDraft> = {}): PasswordChangeDraft {
  return { ...EMPTY_PASSWORD_DRAFT, ...overrides };
}

/** A valid draft, for tests that vary one field. */
function valid(overrides: Partial<PasswordChangeDraft> = {}): PasswordChangeDraft {
  return draft({
    currentPassword: "old-password-1",
    newPassword: "new-password-2",
    confirmPassword: "new-password-2",
    ...overrides,
  });
}

describe("reusing the current password", () => {
  it("is rejected, even though the server would accept it", () => {
    const errors = validatePasswordChange(
      valid({ newPassword: "old-password-1", confirmPassword: "old-password-1" }),
    );
    expect(errors.newPassword).toBe("Choose a password different from your current one.");
  });
});

describe("the length policy, mirrored from the server", () => {
  it("rejects a password shorter than the minimum", () => {
    const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    const errors = validatePasswordChange(valid({ newPassword: short, confirmPassword: short }));
    expect(errors.newPassword).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it("accepts exactly the minimum", () => {
    const exact = "a".repeat(PASSWORD_MIN_LENGTH);
    expect(validatePasswordChange(valid({ newPassword: exact, confirmPassword: exact })).newPassword)
      .toBeUndefined();
  });

  it("rejects a password longer than the maximum", () => {
    const long = "a".repeat(PASSWORD_MAX_LENGTH + 1);
    const errors = validatePasswordChange(valid({ newPassword: long, confirmPassword: long }));
    expect(errors.newPassword).toContain(String(PASSWORD_MAX_LENGTH));
  });

  it("accepts exactly the maximum", () => {
    const exact = "a".repeat(PASSWORD_MAX_LENGTH);
    expect(validatePasswordChange(valid({ newPassword: exact, confirmPassword: exact })).newPassword)
      .toBeUndefined();
  });
});

describe("confirmation", () => {
  it("rejects a mismatch", () => {
    expect(validatePasswordChange(valid({ confirmPassword: "something-else" })).confirmPassword).toBe(
      "This does not match the new password.",
    );
  });

  it("requires the confirmation to be entered at all", () => {
    expect(validatePasswordChange(valid({ confirmPassword: "" })).confirmPassword).toBe(
      "Re-enter the new password.",
    );
  });

  it("compares byte for byte, so trailing whitespace is a mismatch", () => {
    // The draft is deliberately NOT trimmed — a password's spaces are part of it.
    expect(
      validatePasswordChange(valid({ confirmPassword: "new-password-2 " })).confirmPassword,
    ).toBeDefined();
  });
});

describe("required fields", () => {
  it("flags every empty field on an untouched form", () => {
    const errors = validatePasswordChange(EMPTY_PASSWORD_DRAFT);
    expect(errors.currentPassword).toBeDefined();
    expect(errors.newPassword).toBeDefined();
    expect(errors.confirmPassword).toBeDefined();
  });

  it("does not claim reuse when both fields are still empty", () => {
    // "" === "" would otherwise trip the reuse rule and show a confusing message
    // on a form nobody has typed into.
    expect(validatePasswordChange(EMPTY_PASSWORD_DRAFT).newPassword).toBe("Enter a new password.");
  });
});

describe("does not trim", () => {
  it("treats a password of only spaces as present, not empty", () => {
    // Whether that is a GOOD password is the server's business; silently trimming
    // it would send a different secret than the one typed.
    const spaces = "        ";
    const errors = validatePasswordChange(
      draft({ currentPassword: "old-password-1", newPassword: spaces, confirmPassword: spaces }),
    );
    expect(errors.newPassword).toBeUndefined();
  });
});

describe("isPasswordChangeValid", () => {
  it("agrees with an empty error map", () => {
    expect(isPasswordChangeValid(valid())).toBe(true);
    expect(isPasswordChangeValid(EMPTY_PASSWORD_DRAFT)).toBe(false);
  });
});
