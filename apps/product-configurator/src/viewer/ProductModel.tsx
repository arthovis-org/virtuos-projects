import { useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { Vector3, type Object3D } from 'three';
import { useProduct, useResolvedConfiguration } from '@/state/configuratorStore';
import { useModelIssuesStore } from '@/state/modelIssuesStore';
import { Decals } from './Decals';
import { MaterialAppearance } from './MaterialAppearance';
import { useModel } from './models';
import { motionEnvelope, useMotions } from './motion';
import { indexNodes, modelBounds, ownMeshes } from './nodeUtils';
import { WorkspaceLayer } from './workspace/WorkspaceLayer';

/** Loads the product glTF and applies the resolved configuration to it. */
export function ProductModel() {
  const product = useProduct();
  const { scene } = useModel(product.model.src);
  const config = useResolvedConfiguration();
  const invalidate = useThree((state) => state.invalidate);

  const index = useMemo(() => indexNodes(scene), [scene]);
  const partNodes = useMemo(() => {
    const nodes = new Map<string, Object3D>();
    for (const name of product.parts.flatMap((part) => part.nodes)) {
      const node = index.get(name);
      if (node) nodes.set(name, node);
    }
    return nodes;
  }, [index, product]);
  // A part stops where another part begins (monitors parented under the desk top).
  const boundaries = useMemo(() => new Set(partNodes.values()), [partNodes]);
  const motions = useMotions(scene, index, product, boundaries);

  // Report names the catalog expects but the loaded model lacks (after render, not in it).
  useEffect(() => {
    const missing = product.parts
      .flatMap((part) => part.nodes)
      .filter((name) => !partNodes.has(name))
      .map((name) => `object "${name}" was not found in the loaded model`);
    useModelIssuesStore.getState().report(product.id, missing);
  }, [product, partNodes]);

  useEffect(() => {
    for (const [name, node] of partNodes) node.visible = !config.hiddenNodes.has(name);
    invalidate();
  }, [partNodes, config.hiddenNodes, invalidate]);

  // Parts modelled in two versions: only the object's own geometry is swapped, so its
  // children (monitors standing on a desk top) stay. Layers hide a mesh without its children.
  const swapped = useMemo(
    () =>
      product.optionGroups.flatMap((group) =>
        group.type === 'toggle' ? [...group.whenOn, ...group.whenOff] : [],
      ),
    [product],
  );
  useEffect(() => {
    for (const name of swapped) {
      const node = index.get(name);
      if (!node) continue;
      for (const mesh of ownMeshes(node)) {
        if (config.hiddenOwnNodes.has(name)) mesh.layers.disableAll();
        else mesh.layers.set(0);
      }
    }
    invalidate();
  }, [swapped, index, config.hiddenOwnNodes, invalidate]);

  // Centre on the footprint and stand on the floor. Measured once from the model as
  // authored (hidden parts included), so neither toggling parts nor raising the desk shifts
  // it under the camera. `useMotions` above restores the authored pose it measures.
  const bounds = useMemo(() => modelBounds(scene, product.model), [scene, product.model]);
  const offset = useMemo((): [number, number, number] => {
    if (bounds.isEmpty()) return [0, 0, 0];
    const center = bounds.getCenter(new Vector3());
    return [-center.x, -bounds.min.y, -center.z];
  }, [bounds]);

  // An invisible box covering everything the motions can reach. `Bounds` frames it, so a
  // desk raised to full height stays in view; the camera never has to refit mid-motion.
  const framing = useMemo(() => {
    if (motions.length === 0 || bounds.isEmpty()) return null;
    const envelope = motionEnvelope(bounds, motions, product.model.scale);
    return {
      position: envelope.getCenter(new Vector3()).toArray(),
      size: envelope.getSize(new Vector3()).toArray(),
    };
  }, [bounds, motions, product.model.scale]);

  return (
    <group position={offset}>
      <WorkspaceLayer
        product={product}
        scene={scene}
        index={index}
        hiddenNodes={config.hiddenNodes}
      />
      <Suspense fallback={null}>
        <Decals
          product={product}
          scene={scene}
          index={index}
          hiddenOwnNodes={config.hiddenOwnNodes}
        />
      </Suspense>
      {framing && (
        <mesh position={framing.position} visible={false}>
          <boxGeometry args={framing.size} />
        </mesh>
      )}
      <group
        scale={product.model.scale}
        position={product.model.position}
        rotation={product.model.rotation}
      >
        <primitive object={scene} />
        {[...config.materialAssignments].map(([materialName, preset]) => (
          // Textured choices suspend while their images load; keep that local.
          <Suspense key={materialName} fallback={null}>
            <MaterialAppearance scene={scene} materialName={materialName} preset={preset} />
          </Suspense>
        ))}
      </group>
    </group>
  );
}
