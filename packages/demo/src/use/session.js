import { create_store } from "@conradklek/webs";

const initial_user =
  typeof window !== "undefined" ? window.__INITIAL_USER__ : null;

export const use_session = create_store({
  state: () => ({
    current_user: initial_user,
    auth_error: null,
  }),
  getters: {
    is_logged_in() {
      return !!this.current_user;
    },
  },
  actions: {
    async register({ email, username, password }) {
      this.auth_error = null;
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
        this.auth_error = err.message;
        console.error("Registration failed:", err);
      }
    },
    async login(email, password) {
      this.auth_error = null;
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
        this.current_user = data;
        window.location.href = "/";
      } catch (err) {
        this.auth_error = err.message;
        console.error("Login failed:", err);
      }
    },
    async logout() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
        this.current_user = null;
        this.auth_error = null;
        window.location.href = "/login";
      } catch (err) {
        console.error("Logout failed:", err);
      }
    },
  },
});
