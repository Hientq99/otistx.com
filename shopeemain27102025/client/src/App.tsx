import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { requestNotificationPermission } from "@/lib/notifications";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ModernHome from "@/pages/modern-home";
import ShopeeServices from "@/pages/shopee-services";
import PhoneRental from "@/pages/phone-rental";
import PhoneRentalTikTok from "@/pages/phone-rental-tiktok";
import ExternalApiIntegration from "@/pages/external-api-integration";
import PhoneCheck from "@/pages/phone-check";
import AccountCheck from "@/pages/account-check";
import SpcFExtract from "@/pages/spc-f-extract";
import Tracking from "@/pages/tracking";
import TrackingCheck from "@/pages/tracking-check";
import CookieRapidCheck from "@/pages/cookie-rapid-check";
import VoucherSaving from "@/pages/voucher-saving";
import AddEmail from "@/pages/add-email";
import GetCookie from "@/pages/get-cookie";
import CookieManager from "@/pages/cookie-manager";
import TopUp from "@/pages/top-up";
import History from "@/pages/history";
import ApiDocs from "@/pages/api-docs";
import ApiKeys from "@/pages/api-keys";
import UsernameCheck from "@/pages/username-check";

import Contact from "@/pages/contact";
import Dashboard from "@/pages/dashboard";
import Audit from "@/pages/audit";
import Settings from "@/pages/settings";
import Register from "@/pages/register";
import UserManagement from "@/pages/user-management";
import Analytics from "@/pages/analytics";
import ServicePricing from "@/pages/service-pricing";
import SystemConfig from "@/pages/system-config";
import AuditLogs from "@/pages/audit-logs";
import WebhookSettings from "@/pages/webhook-settings";
import HttpProxyManager from "@/pages/http-proxy-manager";
import AutoRefundAdmin from "@/pages/auto-refund-admin";
import CleanupServiceAdmin from "@/pages/cleanup-service-admin";
import DatabaseMigration from "@/pages/database-migration";


function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/" component={ModernHome} />
      <Route path="/phone-rental" component={() => <ProtectedRoute component={PhoneRental} />} />
      <Route path="/phone-rental-tiktok" component={() => <ProtectedRoute component={PhoneRentalTikTok} />} />
      <Route path="/external-api-integration" component={() => <ProtectedRoute component={ExternalApiIntegration} />} />
      <Route path="/phone-check" component={() => <ProtectedRoute component={PhoneCheck} />} />
      <Route path="/account-check" component={() => <ProtectedRoute component={AccountCheck} />} />
      <Route path="/spc-f-extract" component={() => <ProtectedRoute component={SpcFExtract} />} />
      <Route path="/tracking" component={() => <ProtectedRoute component={Tracking} />} />
      <Route path="/tracking-check" component={() => <ProtectedRoute component={TrackingCheck} />} />
      <Route path="/cookie-rapid-check" component={() => <ProtectedRoute component={CookieRapidCheck} />} />
      <Route path="/voucher-saving" component={() => <ProtectedRoute component={VoucherSaving} />} />
      <Route path="/add-email" component={() => <ProtectedRoute component={AddEmail} />} />
      <Route path="/get-cookie" component={() => <ProtectedRoute component={GetCookie} />} />
      <Route path="/cookie-manager" component={() => <ProtectedRoute component={CookieManager} />} />
      <Route path="/top-up" component={() => <ProtectedRoute component={TopUp} />} />
      <Route path="/history" component={() => <ProtectedRoute component={History} />} />
      <Route path="/api-docs" component={() => <ProtectedRoute component={ApiDocs} />} />
      <Route path="/api-keys" component={() => <ProtectedRoute component={ApiKeys} />} />
      <Route path="/username-check" component={() => <ProtectedRoute component={UsernameCheck} />} />
      <Route path="/contact" component={Contact} />
      <Route path="/shopee-services" component={() => <ProtectedRoute component={ShopeeServices} />} />

      <Route path="/audit" component={() => <ProtectedRoute component={Audit} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/user-management" component={() => <ProtectedRoute component={UserManagement} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/service-pricing" component={() => <ProtectedRoute component={ServicePricing} />} />
      <Route path="/system-config" component={() => <ProtectedRoute component={SystemConfig} />} />
      <Route path="/audit-logs" component={() => <ProtectedRoute component={AuditLogs} />} />
      <Route path="/webhook-settings" component={() => <ProtectedRoute component={WebhookSettings} />} />
      <Route path="/http-proxy-manager" component={() => <ProtectedRoute component={HttpProxyManager} />} />
      <Route path="/auto-refund-admin" component={() => <ProtectedRoute component={AutoRefundAdmin} />} />
      <Route path="/cleanup-service-admin" component={() => <ProtectedRoute component={CleanupServiceAdmin} />} />
      <Route path="/database-migration" component={() => <ProtectedRoute component={DatabaseMigration} />} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Request notification permission on app load
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
