import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RestaurantRegistrationError,
  type RestaurantRegistrationInput,
} from "@/lib/restaurant-registration";
import RestaurantRegisterPage from "./RestaurantRegisterPage";
import LoginPortal from "./LoginPortal";

const { navigate, registerRestaurant, toastSuccess } = vi.hoisted(() => ({
  navigate: vi.fn(),
  registerRestaurant: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/lib/restaurant-registration", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/restaurant-registration")
  >("@/lib/restaurant-registration");
  return {
    ...actual,
    registerRestaurant,
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    language: "zh",
    setLanguage: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

const VALID_INPUT: RestaurantRegistrationInput = {
  restaurantName: "好食餐廳",
  contactName: "王小明",
  phone: "0912345678",
  email: "owner@example.com",
  password: "password123",
  confirmPassword: "password123",
  terms: true,
};

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);

const renderPage = () =>
  render(
    <MemoryRouter>
      <RestaurantRegisterPage />
    </MemoryRouter>,
  );

const fillValidForm = async () => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("餐廳名稱"), VALID_INPUT.restaurantName);
  await user.type(
    screen.getByLabelText("聯絡人姓名"),
    VALID_INPUT.contactName,
  );
  await user.type(screen.getByLabelText("聯絡電話"), VALID_INPUT.phone);
  await user.type(screen.getByLabelText("Email"), VALID_INPUT.email);
  await user.type(screen.getByLabelText("密碼"), VALID_INPUT.password);
  await user.type(
    screen.getByLabelText("確認密碼"),
    VALID_INPUT.confirmPassword,
  );
  await user.click(screen.getByRole("checkbox", { name: "同意服務條款" }));
  return user;
};

describe("RestaurantRegisterPage", () => {
  beforeEach(() => {
    navigate.mockReset();
    registerRestaurant.mockReset();
    toastSuccess.mockReset();
  });

  it("renders every registration field and the login entry", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "建立餐廳帳號" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("餐廳名稱")).toHaveAttribute(
      "autocomplete",
      "organization",
    );
    expect(screen.getByLabelText("聯絡人姓名")).toHaveAttribute(
      "autocomplete",
      "name",
    );
    expect(screen.getByLabelText("聯絡電話")).toHaveAttribute(
      "autocomplete",
      "tel",
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "spellcheck",
      "false",
    );
    expect(screen.getByLabelText("密碼")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("確認密碼")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    const terms = screen.getByRole("checkbox", { name: "同意服務條款" });
    expect(terms).toBeInTheDocument();
    expect(terms.closest("label")).toHaveTextContent("同意服務條款");
    expect(screen.getByRole("img", { name: "iFoodmap" })).toHaveAttribute(
      "width",
    );
    expect(screen.getByRole("img", { name: "iFoodmap" })).toHaveAttribute(
      "height",
    );
    expect(
      screen.getByRole("link", { name: "登入平台" }),
    ).toHaveAttribute("href", "/");
  });

  it("shows adjacent validation errors and focuses the first invalid field", async () => {
    renderPage();
    const restaurantName = screen.getByLabelText("餐廳名稱");
    const focus = vi
      .spyOn(restaurantName, "focus")
      .mockImplementation(() => {
        const descriptionId = restaurantName.getAttribute("aria-describedby");
        expect(descriptionId).toBe("restaurantName-error");
        expect(document.getElementById(descriptionId!)).toHaveTextContent(
          "餐廳名稱需為 2 至 100 個字元",
        );
      });

    await userEvent.click(
      screen.getByRole("button", { name: "建立餐廳帳號" }),
    );

    expect(focus).toHaveBeenCalledOnce();
    expect(restaurantName).toHaveAttribute("aria-invalid", "true");
    expect(restaurantName).toHaveAccessibleDescription(
      "餐廳名稱需為 2 至 100 個字元",
    );
    expect(registerRestaurant).not.toHaveBeenCalled();
  });

  it("guards duplicate submission and disables the button while pending", async () => {
    let resolveRegistration!: (value: { restaurantId: string }) => void;
    registerRestaurant.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegistration = resolve;
        }),
    );
    renderPage();
    await fillValidForm();

    const form = screen
      .getByRole("button", { name: "建立餐廳帳號" })
      .closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(registerRestaurant).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "正在建立帳號…" }),
    ).toBeDisabled();

    resolveRegistration({ restaurantId: crypto.randomUUID() });
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it("toasts and navigates to the restaurant dashboard after success", async () => {
    registerRestaurant.mockResolvedValue({
      restaurantId: crypto.randomUUID(),
    });
    renderPage();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "建立餐廳帳號" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("餐廳帳號已建立", {
        description: "歡迎加入 iFoodmap，現在開始設定你的採購流程。",
      });
      expect(navigate).toHaveBeenCalledWith("/restaurant", { replace: true });
    });
    expect(registerRestaurant).toHaveBeenCalledWith(
      expect.anything(),
      VALID_INPUT,
    );
  });

  it.each(["EMAIL_EXISTS", "EMAIL_CONFIRMATION_REQUIRED"] as const)(
    "uses the same neutral email state for %s",
    async (code) => {
      registerRestaurant.mockRejectedValue(
        new RestaurantRegistrationError(code, "raw auth detail"),
      );
      renderPage();
      const user = await fillValidForm();

      await user.click(screen.getByRole("button", { name: "建立餐廳帳號" }));

      const alert = await screen.findByRole("alert", {
        name: "請確認你的 Email",
      });
      expect(alert).toHaveTextContent(
        "如果此 Email 可用，我們會寄送確認資訊；若已有帳號，請直接登入平台。",
      );
      expect(
        within(alert).getByRole("link", { name: "登入平台" }),
      ).toHaveAttribute("href", "/");
      expect(alert).not.toHaveTextContent("此 Email 已經註冊");
      expect(alert).not.toHaveTextContent("raw auth detail");
      expect(navigate).not.toHaveBeenCalled();
      expect(screen.getByLabelText("餐廳名稱")).toHaveValue(
        VALID_INPUT.restaurantName,
      );
      expect(screen.getByLabelText("密碼")).toHaveValue("");
      expect(screen.getByLabelText("確認密碼")).toHaveValue("");
    },
  );

  it("gives an actionable safe path when the signed-in email differs", async () => {
    registerRestaurant.mockRejectedValue(
      new RestaurantRegistrationError(
        "SESSION_EMAIL_MISMATCH",
        "owner@example.com differs from private@example.com",
      ),
    );
    renderPage();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "建立餐廳帳號" }));

    const alert = await screen.findByRole("alert", {
      name: "目前登入的帳號不同",
    });
    expect(alert).toHaveTextContent(
      "請改用目前帳號的 Email，或前往平台登出後再重新註冊。",
    );
    expect(
      within(alert).getByRole("link", { name: "前往平台" }),
    ).toHaveAttribute("href", "/");
    expect(alert).not.toHaveTextContent("owner@example.com");
    expect(alert).not.toHaveTextContent("private@example.com");
  });

  it.each(["ONBOARDING_FAILED", "UNKNOWN"] as const)(
    "shows a safe message for %s, preserves non-password fields, and clears passwords",
    async (code) => {
      registerRestaurant.mockRejectedValue(
        new RestaurantRegistrationError(code, "database raw internal detail"),
      );
      renderPage();
      const user = await fillValidForm();

      await user.click(screen.getByRole("button", { name: "建立餐廳帳號" }));

      expect(
        await screen.findByText("帳號建立未完成，請稍後再試或聯絡客服協助。"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("database raw internal detail"),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("餐廳名稱")).toHaveValue(
        VALID_INPUT.restaurantName,
      );
      expect(screen.getByLabelText("聯絡人姓名")).toHaveValue(
        VALID_INPUT.contactName,
      );
      expect(screen.getByLabelText("密碼")).toHaveValue("");
      expect(screen.getByLabelText("確認密碼")).toHaveValue("");
    },
  );

  it("maps an unexpected network failure to the safe message", async () => {
    registerRestaurant.mockRejectedValue(
      new Error("fetch failed at https://internal.example"),
    );
    renderPage();
    const user = await fillValidForm();

    await user.click(screen.getByRole("button", { name: "建立餐廳帳號" }));

    expect(
      await screen.findByText("帳號建立未完成，請稍後再試或聯絡客服協助。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("fetch failed at https://internal.example"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue(VALID_INPUT.email);
    expect(screen.getByLabelText("密碼")).toHaveValue("");
  });
});

describe("LoginPortal restaurant signup entry", () => {
  beforeEach(() => {
    navigate.mockReset();
  });

  it("links restaurant users to self-service registration", async () => {
    render(
      <MemoryRouter>
        <LoginPortal />
      </MemoryRouter>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /我是餐廳/ }),
    );

    expect(
      screen.getByRole("link", { name: "建立餐廳帳號" }),
    ).toHaveAttribute("href", "/register/restaurant");
  });
});
