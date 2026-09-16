import { createProfileSchema, profileChanges, profileDefaults } from "../profile-form";
import type { User } from "@/types/user";

const user: User = {
  id: "patient",
  email: "patient@example.com",
  displayName: "Ama Kofi de Silva",
  firstName: "Ama Kofi",
  lastName: "de Silva",
  createdAt: "",
  dateOfBirth: "1990-02-28",
  gender: "female",
  bloodType: "AB-",
  primaryGoal: "vitals",
};

test("preserves name parts and produces only changed fields with explicit null for clearing", () => {
  const values = profileDefaults(user);
  expect(values.firstName).toBe("Ama Kofi");
  expect(values.lastName).toBe("de Silva");
  expect(values.dateOfBirth).toBe("28 / 02 / 1990");
  expect(profileChanges(user, values)).toEqual({});
  expect(
    profileChanges(user, { ...values, lastName: "", dateOfBirth: "", gender: "", bloodType: "" }),
  ).toEqual({ lastName: "", dateOfBirth: null, gender: null, bloodType: null });
});

test.each(["30/02/1990", "31/04/1990", "12/05", "1990-02-28", "28/02/2990", "01/01/0000"])(
  "rejects invalid or underage date %s",
  (dateOfBirth) => {
    expect(
      createProfileSchema(user).safeParse({ ...profileDefaults(user), dateOfBirth }).success,
    ).toBe(false);
  },
);

test("accepts leap dates and optional fields without silently clearing an incomplete date", () => {
  const schema = createProfileSchema(user);
  expect(
    schema.safeParse({ ...profileDefaults(user), dateOfBirth: "29 / 02 / 2000" }).success,
  ).toBe(true);
  expect(
    schema.safeParse({
      ...profileDefaults(user),
      dateOfBirth: "",
      bloodType: "",
      gender: "",
      primaryGoal: "",
    }).success,
  ).toBe(true);
  expect(schema.safeParse({ ...profileDefaults(user), dateOfBirth: "28 / 02 /" }).success).toBe(
    false,
  );
});

test("allows a mononym but rejects missing first name and names longer than the database limit", () => {
  const schema = createProfileSchema(user);
  expect(schema.safeParse({ ...profileDefaults(user), lastName: "" }).success).toBe(true);
  for (const value of ["", "   ", "a".repeat(256)]) {
    expect(schema.safeParse({ ...profileDefaults(user), firstName: value }).success).toBe(false);
  }
});

test("preserves an existing legacy gender when editing another field", () => {
  const legacy = { ...user, gender: "Female" };
  const values = { ...profileDefaults(legacy), firstName: "Updated" };
  expect(createProfileSchema(legacy).safeParse(values).success).toBe(true);
  expect(profileChanges(legacy, values)).toEqual({ firstName: "Updated" });
});
