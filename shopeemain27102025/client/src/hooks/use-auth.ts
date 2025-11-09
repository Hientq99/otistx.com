import { useState, useEffect } from "react";
import { authService, type User } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(authService.isAuthenticated());
  const [, setLocation] = useLocation();

  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/me"],
    enabled: isAuthenticated,
    retry: false,
  });

  const login = async (username: string, password: string) => {
    const response = await authService.login(username, password);
    authService.setToken(response.token);
    
    // Force authentication state update
    setIsAuthenticated(true);
    
    // Trigger immediate user data fetch
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return response;
  };

  const logout = async () => {
    try {
      // Call logout endpoint to log admin actions
      if (authService.isAuthenticated()) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authService.getToken()}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.error('Logout logging error:', error);
    } finally {
      authService.removeToken();
      setIsAuthenticated(false);
      // Redirect to home page after logout
      setLocation('/');
    }
  };

  useEffect(() => {
    if (error && isAuthenticated) {
      logout();
    }
  }, [error, isAuthenticated]);

  return {
    user: user as User | undefined,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };
}
