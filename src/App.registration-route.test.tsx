import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));

describe("restaurant registration route", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/register/restaurant");
  });

  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("resolves the public registration page through the application router", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "免費建立餐廳帳號" }),
    ).toBeInTheDocument();
  });
});
