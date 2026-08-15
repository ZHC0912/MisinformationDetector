// ============================================================
// ERROR BOUNDARY
// Catches render errors in its children so an uncaught exception
// shows a recoverable message instead of a blank white screen.
// ============================================================

import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Log for debugging; in production this could go to a monitoring service.
    console.error("ErrorBoundary caught an error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto w-full max-w-3xl px-4 py-16">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The view hit an unexpected error while rendering. Your input is
              safe — you can go back and try again.
            </p>
            <Button className="mt-4" onClick={this.handleReset}>
              <ArrowLeft /> Back to input
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
