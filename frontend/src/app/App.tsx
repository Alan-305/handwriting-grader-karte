import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/feedback/ErrorBoundary";
import { isFirebaseConfigured } from "@/lib/firebase";
import { SetupPage } from "@/pages/SetupPage";
import { AppProviders } from "./providers";

export default function App() {
  if (!isFirebaseConfigured) {
    return <SetupPage />;
  }

  return (
    <ErrorBoundary>
      <AppProviders />
    </ErrorBoundary>
  );
}
