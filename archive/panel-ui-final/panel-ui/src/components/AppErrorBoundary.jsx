import { Component } from "react";

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[AppErrorBoundary]", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const message =
        this.state.error?.message || "An unexpected error occurred.";

      return (
        <div className="error-boundary">
          <div className="error-boundary__icon">⚠️</div>
          <h2 className="error-boundary__title">Something went wrong</h2>
          <p className="error-boundery__message">{message}</p>
          {process.env.NODE_ENV === "development" && this.state.errorInfo && (
            <pre className="error-boundary__stack">
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <div className="error-boundary__actions">
            <button onClick={this.handleRetry} className="btn">
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn btn--ghost"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}