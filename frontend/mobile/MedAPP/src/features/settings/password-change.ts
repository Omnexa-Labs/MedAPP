// Validation for the change-password form, kept out of the render.
//
// The rules MIRROR the server's, which is the point: `ChangePasswordRequest`
// declares `new_password: str = Field(min_length=8, max_length=128)`, so a
// 7-character password is a 422 from FastAPI's validator rather than a 400 with a
// readable `detail`. Checking it here turns that into a field message instead of
// "Request failed with status 422" — the client is not the authority on the
// policy, it just refuses to spend a round trip discovering the obvious.
//
// Everything the server alone can judge stays on the server. In particular
// WHETHER THE CURRENT PASSWORD IS CORRECT is never guessed at here; that is a 400
// whose `detail` the screen surfaces verbatim.

/** Mirrors `ChangePasswordRequest`'s `Field(min_length=8, max_length=128)`. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordChangeDraft = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export const EMPTY_PASSWORD_DRAFT: PasswordChangeDraft = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

/** Field-keyed messages. An absent key means that field is fine. */
export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeDraft, string>>;

/**
 * Validate a draft.
 *
 * NOT trimmed. A password's leading or trailing space is part of it — trimming
 * here would send a different secret than the one the patient typed, and the
 * mismatch would surface as "current password is wrong" on the NEXT change, long
 * after the cause.
 */
export function validatePasswordChange(draft: PasswordChangeDraft): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};

  if (draft.currentPassword.length === 0) {
    errors.currentPassword = "Enter your current password.";
  }

  if (draft.newPassword.length === 0) {
    errors.newPassword = "Enter a new password.";
  } else if (draft.newPassword.length < PASSWORD_MIN_LENGTH) {
    errors.newPassword = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  } else if (draft.newPassword.length > PASSWORD_MAX_LENGTH) {
    errors.newPassword = `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  } else if (draft.newPassword === draft.currentPassword) {
    // The server would accept this — it only checks the current password matches
    // and the new one meets the length policy. Accepting it means a patient who
    // came here to rotate a password they believe is compromised leaves believing
    // they have, having changed nothing.
    errors.newPassword = "Choose a password different from your current one.";
  }

  if (draft.confirmPassword.length === 0) {
    errors.confirmPassword = "Re-enter the new password.";
  } else if (draft.confirmPassword !== draft.newPassword) {
    errors.confirmPassword = "This does not match the new password.";
  }

  return errors;
}

export function isPasswordChangeValid(draft: PasswordChangeDraft): boolean {
  return Object.keys(validatePasswordChange(draft)).length === 0;
}
