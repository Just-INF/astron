import { Component, type ErrorInfo, type ReactNode } from "react";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render failure", error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal-error">
          <p className="eyebrow">Something went wrong</p>
          <h1>This view could not be opened.</h1>
          <p>
            Your data has not been changed. Reload the page, or contact support if this continues.
          </p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            Reload Astron
          </button>
        </main>
      );
    return this.props.children;
  }
}
