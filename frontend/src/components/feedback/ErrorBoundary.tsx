import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="max-w-lg rounded-xl border border-red-200 bg-white p-8 shadow-sm">
            <h1 className="font-ja text-xl font-semibold text-red-800">エラーが発生しました</h1>
            <p className="mt-3 font-ja text-sm leading-relaxed text-slate-600">
              {this.state.error.message}
            </p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              再読み込み
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
