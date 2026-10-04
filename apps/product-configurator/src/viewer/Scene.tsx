import { Bounds, ContactShadows, OrbitControls, useBounds } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { LoadingIndicator } from './LoadingIndicator';
import { StudioEnvironment } from './StudioEnvironment';
import { ViewerErrorBoundary } from './ViewerErrorBoundary';
import { useWorkspaceStore } from '@/state/workspaceStore';
import { WorkspaceHud } from '@/ui/workspace/WorkspaceHud';
import { preloadCurrentProduct } from './models';
import { ProductModel } from './ProductModel';
import { ScreenLayer } from './workspace/ScreenLayer';
import styles from './Scene.module.css';

// This module is loaded lazily, and this is the earliest point where three is available.
preloadCurrentProduct();

/**
 * Reframes the product when the canvas is resized, unless workspace mode has the camera.
 * `Bounds observe` can't be switched off for that: turning it off makes drei refit once.
 */
function RefitOnResize() {
  const bounds = useBounds();
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (useWorkspaceStore.getState().cameraFree) bounds.refresh().clip().fit();
  }, [bounds, width, height]);
  return null;
}

/**
 * Studio-style viewer: soft environment light, contact shadow, damped orbit controls.
 *
 * Layers, bottom to top: the surface the orbit controls listen on, the workspace sites, the
 * transparent canvas (which lets the pointer through and shows the sites through holes in the
 * screens, so the model hides them where it is in front), then the workspace controls.
 */
export function Scene() {
  const [orbitSurface, setOrbitSurface] = useState<HTMLDivElement | null>(null);
  return (
    <div className={styles.viewer}>
      <div ref={setOrbitSurface} className={styles.orbitSurface} />
      <ScreenLayer />
      <Canvas
        // Above the sites, but the pointer goes through to them and to the orbit surface.
        style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
        // Render only when something changes (camera, selection); the scene is static otherwise.
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [2.2, 1.4, 2.6], fov: 35, near: 0.05, far: 50 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ViewerErrorBoundary>
          <Suspense fallback={<LoadingIndicator />}>
            <Bounds fit clip margin={1.25}>
              <RefitOnResize />
              <ProductModel />
            </Bounds>
          </Suspense>
        </ViewerErrorBoundary>
        <StudioEnvironment />
        <directionalLight position={[3, 5, 2]} intensity={1.2} />
        <ContactShadows
          position={[0, -0.001, 0]}
          opacity={0.55}
          scale={5}
          blur={1.6}
          // Tall enough to catch a desk top at standing height.
          far={2}
          resolution={1024}
        />
        <OrbitControls
          makeDefault
          {...(orbitSurface && { domElement: orbitSurface })}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={1}
          maxDistance={6}
          minPolarAngle={Math.PI / 8}
          maxPolarAngle={Math.PI / 2 - 0.02}
          // No fixed target: `Bounds` points the controls at the centre of what it frames,
          // which includes the full height range of a motorised desk.
        />
      </Canvas>
      <WorkspaceHud />
    </div>
  );
}
