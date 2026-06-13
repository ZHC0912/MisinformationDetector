// ============================================================
// ERROR BOUNDARY
// File: src/ErrorBoundary.js
// Catches render errors in its children so an uncaught exception
// shows a recoverable message instead of a blank white screen.
// ============================================================

import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Log for debugging; in production this could go to a monitoring service.
    console.error("ErrorBoundary caught an error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="page">
          <div className="results-card">
            <h2>Something went wrong</h2>
            <p className="lime-desc">
              The view hit an unexpected error while rendering. Your input is safe —
              you can go back and try again.
            </p>
            <button className="btn-primary" onClick={this.handleReset}>← Back to input</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
