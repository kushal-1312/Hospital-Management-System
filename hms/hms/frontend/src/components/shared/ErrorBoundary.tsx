import { Component, type ErrorInfo, type PropsWithChildren } from 'react';

interface State { hasError: boolean }

export default class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failure', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error" role="alert">
          <div className="fatal-error__mark">+</div>
          <h1>We could not open this workspace</h1>
          <p>Your data is safe. Reload the page to reconnect to MedCare.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload workspace</button>
        </main>
      );
    }
    return this.props.children;
  }
}
