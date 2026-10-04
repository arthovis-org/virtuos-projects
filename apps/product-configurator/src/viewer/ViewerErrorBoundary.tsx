import { Html } from '@react-three/drei';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './LoadingIndicator.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  message: string | null;
}

/** Keeps a broken model (missing file, bad glTF) from taking down the whole page. */
export class ViewerErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : 'Could not load the model.' };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[configurator] viewer error', error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <Html center>
          <div className={styles.indicator} role="alert">
            {this.state.message}
          </div>
        </Html>
      );
    }
    return this.props.children;
  }
}
