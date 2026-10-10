import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Vector3, type Group, type Object3D } from 'three';
import type { ProductDefinition } from '@/catalog/schema';
import { resolveConfiguration, type Selections } from '@/state/derive';
import { useModelIssuesStore } from '@/state/modelIssuesStore';
import { useMotionStore } from '@/state/motionStore';
import { currentDesk, deskName, SINGLE_DESK, type DeskSetup } from '@/state/setup';
import { useProduct, useSetupStore } from '@/state/setupStore';
import { useViewStore } from '@/state/viewStore';
import { Decals } from './Decals';
import { DeskLabel } from './DeskLabel';
import { HeightInset } from './HeightInset';
import { deskArcs, TALL_ARCS, WIDE_ARCS } from './deskLayout';
import { MaterialAppearance } from './MaterialAppearance';
import { deskModel, releaseDeskModels, rememberPristine, useModel, type DeskModel } from './models';
import { defaultMotionBox, motionEnvelope, useMotions } from './motion';
import { modelBounds, ownMeshes } from './nodeUtils';
import { Occupant } from './people/Occupant';
import { deskObjects } from './deskObjects';
import { DeskPosters } from './workspace/DeskPosters';
import { WorkspaceLayer } from './workspace/WorkspaceLayer';

const ORIGIN: [number, number, number] = [0, 0, 0];
/**
 * A screen held upright. Decided by the screen, not the viewer: the viewer changes shape when
 * the phone's option sheet opens, and rebuilding the room then moved desks under the seated
 * camera (another desk ended up right in front of it).
 */
const PORTRAIT = '(orientation: portrait)';
const subscribePortrait = (onChange: () => void) => {
  const query = window.matchMedia(PORTRAIT);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isPortrait = () => window.matchMedia(PORTRAIT).matches;

/** How quickly swapped desks glide to their new places (per second, exponential). */
const GLIDE_RATE = 6;
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
  const single = useSetupStore((s) => s.single);
  const desksMode = useSetupStore((s) => s.mode === 'desks');
  const desks = useSetupStore((s) => s.room);
  const activeDeskId = useSetupStore((s) => s.activeDeskId);
  const setRoom = useViewStore((s) => s.setRoom);
  const seated = useViewStore((s) => s.seated);
  // The desk whose sites can go live: the single desk, or the one the visitor is at.
  const activeSelections = useSetupStore((s) => currentDesk(s)?.selections);

  const footprint = useMemo(
    () => modelBounds(scene, product.model).getSize(new Vector3()),
    [scene, product.model],
  );
  // A phone held upright gets a tighter, deeper room (see `TALL_ARCS`).
  const tall = useSyncExternalStore(subscribePortrait, isPortrait);
  const layout = useMemo(
    () =>
      desksMode
        ? deskArcs(desks.length, footprint.x, footprint.z, tall ? TALL_ARCS : WIDE_ARCS)
        : null,
    [desksMode, desks.length, footprint, tall],
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
        position: layout?.placements[i]?.position ?? ORIGIN,
        rotation: layout?.placements[i]?.rotation ?? 0,
      }))
    : [
        {
          id: SINGLE_DESK,
          desk: single,
          model: deskModel(scene, null),
          position: ORIGIN,
          rotation: 0,
        },
      ];
  // In the room, no desk is live until the visitor picks one (all show posters).
  const active = desksMode ? items.find((item) => item.desk.id === activeDeskId) : items[0];
  const activeConfig = useMemo(
    () => (activeSelections ? resolveConfiguration(product, activeSelections) : null),
    [product, activeSelections],
  );

  return (
    <>
      {active && activeConfig && (
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
          selections={item.desk.selections}
          position={item.position}
          rotation={item.rotation}
          layoutKey={`${items.length}${tall ? ' tall' : ''}`}
          // Seated at a desk in the room, the others are out of the picture: their monitors
          // would stand between the camera and the screens.
          hidden={desksMode && seated && item !== active}
          inSeat={seated && item === active}
          reportsMotion={i === 0}
          deskId={item.desk.id}
          desk={
            desksMode
              ? {
                  desk: item.desk,
                  number: i + 1,
                  name: deskName(product, desks, item.desk),
                  active: item === active,
                  showLabel: !seated,
                }
              : undefined
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
  /**
   * Changes when the room grows or shrinks: desks then jump to their places (the camera
   * frames the new room at once); otherwise (two desks swapped) they glide there.
   */
  layoutKey: string;
  /** Reports names the loaded model lacks (one desk is enough). */
  reportsMotion: boolean;
  /** Out of the picture (another desk is the one the visitor sits at). */
  hidden: boolean;
  /** The visitor sits at this desk (the seated view): its occupant would be in the way. */
  inSeat: boolean;
  /** The desk this is (its height). */
  deskId: string;
  /** In unlimited desks mode: which desk this is. */
  desk:
    | { desk: DeskSetup; number: number; name: string; active: boolean; showLabel: boolean }
    | undefined;
}

/** One desk: a copy of the model with a configuration applied. */
function DeskInstance({
  product,
  model,
  selections,
  position,
  rotation,
  layoutKey,
  reportsMotion,
  hidden,
  inSeat,
  deskId,
  desk,
}: DeskInstanceProps) {
  const { scene, index } = model;
  const config = useMemo(() => resolveConfiguration(product, selections), [product, selections]);
  const invalidate = useThree((state) => state.invalidate);
  const group = useRef<Group>(null);

  const [px, py, pz] = position;
  const goal = useMemo(() => new Vector3(px, py, pz), [px, py, pz]);
  const placedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    const desk = group.current;
    if (!desk) return;
    if (placedFor.current !== layoutKey) {
      desk.position.copy(goal);
      desk.rotation.y = rotation;
      placedFor.current = layoutKey;
    }
    invalidate();
  }, [goal, rotation, layoutKey, invalidate]);
  useFrame((_, delta) => {
    const desk = group.current;
    if (!desk) return;
    const far = desk.position.distanceToSquared(goal);
    const turn = rotation - desk.rotation.y;
    if (far < 1e-8 && Math.abs(turn) < 1e-6) return;
    if (far < 1e-6 && Math.abs(turn) < 1e-4) {
      desk.position.copy(goal);
      desk.rotation.y = rotation;
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * GLIDE_RATE);
      desk.position.lerp(goal, k);
      desk.rotation.y += turn * k;
    }
    invalidate();
  });
  // Where this desk is, for what travels between desks.
  useEffect(() => {
    const object = group.current;
    if (!object) return;
    deskObjects.set(deskId, object);
    return () => {
      if (deskObjects.get(deskId) === object) deskObjects.delete(deskId);
    };
  }, [deskId]);

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
  const motions = useMotions(scene, index, product, boundaries, deskId);

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

  // In the room, an invisible box covering everything the motions can reach. `Bounds` frames
  // it, so a desk raised to full height stays in view; the camera never has to refit
  // mid-motion. The single desk is framed at its default height instead: the envelope's empty
  // band above it pushed the desk down the view.
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
    const box = desk ? envelope : defaultMotionBox(bounds, motions, product.model.scale);
    return {
      position: box.getCenter(new Vector3()).toArray(),
      size: box.getSize(new Vector3()).toArray(),
    };
  }, [desk, envelope, bounds, motions, product.model.scale]);

  return (
    <group ref={group} visible={!hidden}>
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
      {!bounds.isEmpty() && (
        <Occupant
          product={product}
          deskId={deskId}
          desk={group}
          index={index}
          front={bounds.getSize(new Vector3()).z / 2}
          visible={!hidden && !inSeat}
        />
      )}
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
