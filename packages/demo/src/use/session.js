import { create_store } from "@conradklek/webs";

const initial_user =
  typeof window !== "undefined" ? window.__WEBS_STATE__?.user : null;

export const use_session = create_store({
  state: () => ({
    user: initial_user,
    error: null,
  }),
  getters: {
    is_logged_in() {
      return !!this.user;
    },
  },
  actions: {
    async register({ email, username, password }) {
      this.error = null;
      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, username, password }),
        });
        if (!response.ok) {
          const error_text = await response.text();
          throw new Error(error_text || "Registration failed");
        }
        window.location.href = "/login";
      } catch (err) {
        this.error = err.message;
        console.error("Registration failed:", err);
      }
    },
    async login(email, password) {
      this.error = null;
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          const error_text = await response.text();
          throw new Error(error_text || "Login failed");
        }
        const data = await response.json();
        console.log({ data });
        this.user = data;
        window.location.href = "/";
      } catch (err) {
        this.error = err.message;
        console.error("Login failed:", err);
      }
    },
    async logout() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
        this.user = null;
        this.error = null;
        window.location.href = "/login";
      } catch (err) {
        console.error("Logout failed:", err);
      }
    },
  },
});
