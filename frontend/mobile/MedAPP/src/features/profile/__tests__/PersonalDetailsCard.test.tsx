import { render, screen } from "@testing-library/react-native";
import { PersonalDetailsCard } from "../PersonalDetailsCard";
import type { User } from "@/types/user";

test("renders the signed-in patient's saved details with a self-reported blood type label", () => {
  const user: User = {
    id: "patient",
    email: "patient@example.com",
    displayName: "Ama Mensah",
    createdAt: "",
    dateOfBirth: "1995-04-12",
    gender: "female",
    bloodType: "AB+",
    primaryGoal: "vitals",
  };
  render(<PersonalDetailsCard user={user} />);
  expect(screen.getByText("12 / 04 / 1995")).toBeTruthy();
  expect(screen.getByText("Female")).toBeTruthy();
  expect(screen.getByText("Blood type (self-reported)")).toBeTruthy();
  expect(screen.getByText("AB+")).toBeTruthy();
  expect(screen.getByText("Track Vitals")).toBeTruthy();
});

test("missing fields stay empty instead of displaying example patient data", () => {
  render(<PersonalDetailsCard user={null} />);
  expect(screen.getAllByText("Not provided")).toHaveLength(4);
  expect(screen.queryByText("O+")).toBeNull();
});
