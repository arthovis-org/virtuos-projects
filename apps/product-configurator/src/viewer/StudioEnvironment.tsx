import { Environment, Lightformer } from '@react-three/drei';

/**
 * Procedural soft-box lighting rendered into an environment map. Built from
 * light formers instead of an HDR preset so the app has no runtime dependency
 * on a third-party CDN and looks identical offline.
 */
export function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.9}>
      <color attach="background" args={['#d9d9d9']} />
      {/* Overhead key light */}
      <Lightformer
        form="rect"
        intensity={3}
        position={[0, 5, 0]}
        rotation-x={Math.PI / 2}
        scale={[6, 6, 1]}
      />
      {/* Broad, dim fill from the front */}
      <Lightformer form="rect" intensity={1.2} position={[0, 2, 6]} scale={[8, 4, 1]} />
      {/* Rim / side strips for edge definition on metallic parts */}
      <Lightformer
        form="rect"
        intensity={2}
        position={[-6, 2, 0]}
        rotation-y={Math.PI / 2}
        scale={[4, 1.5, 1]}
      />
      <Lightformer
        form="rect"
        intensity={2}
        position={[6, 2, -1]}
        rotation-y={-Math.PI / 2}
        scale={[4, 1.5, 1]}
      />
    </Environment>
  );
}
