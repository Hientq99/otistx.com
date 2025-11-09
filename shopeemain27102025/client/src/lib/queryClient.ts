import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest({
  url,
  method = "GET",
  body,
}: {
  url: string;
  method?: string;
  body?: unknown;
}): Promise<any> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // Handle empty responses
  const text = await res.text();
  if (!text) return null;
  
  let result;
  try {
    result = JSON.parse(text);
  } catch (error) {
    console.error('JSON parse error:', error);
    console.error('Response text:', text);
    console.error('Response status:', res.status);
    console.error('Response headers:', Object.fromEntries(res.headers.entries()));
    throw new Error(`Invalid JSON response: ${text.substring(0, 100)}...`);
  }

  // Invalidate balance cache after service transactions
  const serviceEndpoints = [
    '/api/phone-check',
    '/api/account-check', 
    '/api/tracking-check',
    '/api/add-email',
    '/api/cookie-extract',
    '/api/tiktok-rental/start',
    '/api/phone-rental',
    '/api/topup/generate-qr'
  ];
  
  if (method !== "GET" && serviceEndpoints.some(endpoint => url.includes(endpoint))) {
    // Invalidate balance and transaction history for real-time updates
    queryClient.invalidateQueries({ queryKey: ["/api/user/balance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
  }

  return result;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    
    // Handle empty responses
    const text = await res.text();
    if (!text) return null;
    
    try {
      return JSON.parse(text);
    } catch (error) {
      console.error('JSON parse error:', error);
      console.error('Response text:', text);
      console.error('Response status:', res.status);
      console.error('Response headers:', Object.fromEntries(res.headers.entries()));
      throw new Error(`Invalid JSON response: ${text.substring(0, 100)}...`);
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
