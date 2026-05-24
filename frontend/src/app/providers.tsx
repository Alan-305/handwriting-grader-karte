import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppRoutes } from "./routes";

const queryClient = new QueryClient();

export function AppProviders({ children }: { children?: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>{children ?? <AppRoutes />}</BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
