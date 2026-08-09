// Generic React error boundary — without one, an uncaught render error in
// any child silently unmounts the whole subtree (a fully blank page, no
// feedback), which is exactly what happened to the HR Dashboard tab. Wraps
// content that's newer/less battle-tested so a bug in one tab can't take
// down the whole page with zero explanation.
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-state">
          <div className="empty-title">Something went wrong loading this section</div>
          <p>{this.state.error.message || 'An unexpected error occurred.'}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => this.setState({ error: null })} style={{ marginTop: 10 }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
