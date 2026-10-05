import { useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Vector3, type Group, type Object3D } from 'three';
import type { ProductDefinition } from '@/catalog/schema';
import { useProduct, useSelections } from '@/state/configuratorStore';
import { resolveConfiguration, type Selections } from '@/state/derive';
import { activeDesk, deskName, useDesksStore, type Desk } from '@/state/desksStore';
import { useModelIssuesStore } from '@/state/modelIssuesStore';
import { SINGLE_DESK_KEY, useMotionStore } from '@/state/motionStore';
import { useWorkspaceStore } from '@/state/workspaceStore';
import { Decals } from './Decals';
import { DeskLabel } from './DeskLabel';
import { HeightInset } from './HeightInset';
import { deskArcs } from './deskLayout';
import { MaterialAppearance } from './MaterialAppearance';
import { deskModel, releaseDeskModels, rememberPristine, useModel, type DeskModel } from './models';
import { motionEnvelope, useMotions } from './motion';
import { modelBounds, ownMeshes } from './nodeUtils';
import { DeskPosters } from './workspace/DeskPosters';
import { WorkspaceLayer } from './workspace/WorkspaceLayer';

const ORIGIN: [number, number, number] = [0, 0, 0];
/** Space between the top of a desk and its name tag, in metres. */
const LABEL_LIFT = 0.22;

/**
 * Loads the product glTF and shows it as configured: one desk, or in unlimited desks mode a
 * room of desks, each a copy of the model with its own configuration. The workspace (live
 * sites, seated camera) belongs to the desk the visitor is at.
 */
export function ProductModel() {
  const product = useProduct();
  const { scene } = useModel(product.model.src);
  // Before anything below changes the scene: desks are copied from the model as exported.
  rememberPristine(scene);
  const selections = useSelections();
  const desksMode = useDesksStore((s) => s.mode === 'desks');
  const desks = useDesksStore((s) => s.desks);
  const activeDeskId = useDesksStore((s) => s.activeDeskId);
  const setRoom = useDesksStore((s) => s.setRoom);
  const deskSelections = useDesksStore((s) =>
    s.mode === 'desks' ? activeDesk(s)?.selections : undefined,
  );
  const activeSelections = deskSelections ?? selections;
  const seated = useWorkspaceStore((s) => s.seated);

  const footprint = useMemo(
    () => modelBounds(scene, product.model).getSize(new Vector3()),
    [scene, product.model],
  );
  const layout = useMemo(
    () => (desksMode ? deskArcs(desks.length, footprint.x, footprint.z) : null),
    [desksMode, desks.length, footprint],
  );
  useEffect(() => setRoom(layout?.room ?? { width: 0, depth: 0 }), [layout, setRoom]);
  useEffect(
    () =>
      releaseDeskModels(
        scene,
        desks.map((d) => d.id),
      ),
    [scene, desks],
  );

  const items = desksMode
    ? desks.map((desk, i) => ({
        id: desk.id,
        desk,
        model: deskModel(scene, desk.id),
        selections: desk.selections,
        position: layout?.placements[i]?.position ?? ORIGIN,
        rotation: layout?.placements[i]?.rotation ?? 0,
      }))
    : [
        {
          id: '',
          desk: undefined,
          model: deskModel(scene, null),
          selections,
          position: ORIGIN,
          rotation: 0,
        },
      ];
  const active = items.find((item) => item.desk?.id === activeDeskId) ?? items[0];
  const activeConfig = useMemo(
    () => resolveConfiguration(product, activeSelections),
    [product, activeSelections],
  );

  return (
    <>
      {active && (
        <WorkspaceLayer
          product={product}
          scene={active.model.scene}
          index={active.model.index}
          hiddenNodes={activeConfig.hiddenNodes}
        />
      )}
      {items.map((item, i) => (
        <DeskInstance
          key={item.id}
          product={product}
          model={item.model}
          selections={item.selections}
          position={item.position}
          rotation={item.rotation}
          reportsMotion={i === 0}
          motionKey={item.desk?.id ?? SINGLE_DESK_KEY}
          desk={
            item.desk && {
              desk: item.desk,
              number: i + 1,
              name: deskName(product, desks, item.desk),
              active: item === active,
              showLabel: !seated,
            }
          }
        />
      ))}
    </>
  );
}

interface DeskInstanceProps {
  product: ProductDefinition;
  model: DeskModel;
  selections: Selections;
  position: [number, number, number];
  /** Turn about the vertical axis, in radians (desks in the room face a common point). */
  rotation: number;
  /** Reports names the loaded model lacks (one desk is enough). */
  reportsMotion: boolean;
  /** Where this desk's height lives in the motion store. */
  motionKey: string;
  /** In unlimited desks mode: which desk this is. */
  desk:
    { desk: Desk; number: number; name: string; active: boolean; showLabel: boolean } | undefined;
}

/** One desk: a copy of the model with a configuration applied. */
function DeskInstance({
  product,
  model,
  selections,
  position,
  rotation,
  reportsMotion,
  motionKey,
  desk,
}: DeskInstanceProps) {
  const { scene, index } = model;
  const config = useMemo(() => resolveConfiguration(product, selections), [product, selections]);
  const invalidate = useThree((state) => state.invalidate);
  const group = useRef<Group>(null);
  // The side view of the height control shows the desk the visitor is at.
  const showsInset = useMotionStore((s) => s.insetOpen) && (!desk || desk.active);

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
  const motions = useMotions(scene, index, product, boundaries, motionKey);

  // Report names the catalog expects but the loaded model lacks (after render, not in it).
  useEffect(() => {
    if (!reportsMotion) return;
    const missing = product.parts
      .flatMap((part) => part.nodes)
      .filter((name) => !partNodes.has(name))
      .map((name) => `object "${name}" was not found in the loaded model`);
    useModelIssuesStore.getState().report(product.id, missing);
  }, [product, partNodes, reportsMotion]);

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
  const envelope = useMemo(
    () =>
      motions.length === 0 || bounds.isEmpty()
        ? bounds
        : motionEnvelope(bounds, motions, product.model.scale),
    [bounds, motions, product.model.scale],
  );
  const reach = useMemo(
    () => envelope.clone().translate(new Vector3(...offset)),
    [envelope, offset],
  );
  const framing = useMemo(() => {
    if (motions.length === 0 || envelope.isEmpty()) return null;
    return {
      position: envelope.getCenter(new Vector3()).toArray(),
      size: envelope.getSize(new Vector3()).toArray(),
    };
  }, [envelope, motions.length]);

  return (
    <group ref={group} position={position} rotation={[0, rotation, 0]}>
      <group position={offset}>
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
      {showsInset && !reach.isEmpty() && <HeightInset desk={group} reach={reach} />}
      {desk && !desk.active && (
        <DeskPosters
          product={product}
          deskId={desk.desk.id}
          scene={scene}
          index={index}
          hiddenNodes={config.hiddenNodes}
        />
      )}
      {desk?.showLabel && !envelope.isEmpty() && (
        <DeskLabel
          deskId={desk.desk.id}
          name={desk.name}
          number={desk.number}
          workspace={product.workspaces.find((w) => w.id === desk.desk.workspaceId)}
          height={envelope.max.y + offset[1] + LABEL_LIFT}
          active={desk.active}
        />
      )}
    </group>
  );
}
