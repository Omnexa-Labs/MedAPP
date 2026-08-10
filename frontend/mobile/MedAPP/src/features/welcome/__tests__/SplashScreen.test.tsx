import { fireEvent, render, screen } from "@testing-library/react-native";
import { SplashScreen } from "../SplashScreen";

// The screen's only side-effect is persisting the "welcome seen" flag; stub the
// storage layer so the test doesn't touch AsyncStorage.
jest.mock("@/lib/storage/prefs", () => ({
  prefs: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
}));

describe("SplashScreen", () => {
  it("renders the approved copy", () => {
    render(<SplashScreen />);
    expect(screen.getByText("MedApp")).toBeTruthy();
    expect(screen.getByText("Personalized care for a modern world.")).toBeTruthy();
    expect(screen.getByText("Trusted by 2M+ medical professionals")).toBeTruthy();
    expect(screen.getByText("Already have an account? Sign In")).toBeTruthy();
  });

  it("forwards both navigation actions", () => {
    const onGetStarted = jest.fn();
    const onSignIn = jest.fn();
    render(<SplashScreen onGetStarted={onGetStarted} onSignIn={onSignIn} />);

    fireEvent.press(screen.getByTestId("splash.getStarted"));
    expect(onGetStarted).toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("splash.signIn"));
    expect(onSignIn).toHaveBeenCalled();
  });
});
