import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Rendered instead of children after an error. */
  fallback: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

/** Generic error boundary (React still requires a class for this). OWNER: Role C. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
