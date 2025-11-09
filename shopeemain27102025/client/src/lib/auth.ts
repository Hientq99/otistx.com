import { apiRequest } from "./queryClient";

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const authService = {
  async login(username: string, password: string): Promise<AuthResponse> {
    return await apiRequest({
      url: "/api/auth/login", 
      method: "POST", 
      body: { username, password }
    });
  },

  async getCurrentUser(): Promise<User> {
    return await apiRequest({
      url: "/api/auth/me",
      method: "GET"
    });
  },

  getToken(): string | null {
    return localStorage.getItem("token");
  },

  setToken(token: string): void {
    try {
      localStorage.setItem("token", token);
      console.log("Token set successfully:", token ? "✓" : "✗");
    } catch (error) {
      console.error("Failed to set token:", error);
    }
  },

  removeToken(): void {
    localStorage.removeItem("token");
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
};
