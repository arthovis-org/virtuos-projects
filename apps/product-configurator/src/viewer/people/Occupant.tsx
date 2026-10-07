import { useGLTF } from '@react-three/drei';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  FrontSide,
  MathUtils,
  Matrix4,
  Vector3,
  type AnimationAction,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  type Side,
} from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ProductDefinition } from '@/catalog/schema';
import { motionKey, useMotionStore } from '@/state/motionStore';
import { useSetupStore } from '@/state/setupStore';
import { findArms, reach } from './armIk';
import { characterUrl, propUrl } from './assets';
import { deskSurface } from './deskSurface';

/** Clips by role; characters/<Name>'s clips are named after their Mixamo files. */
const CLIPS = {
  working: 'typing',
  seated: 'sittingIdle',
  standing: 'standingIdle',
  rising: 'sitToStand',
  sittingDown: 'standToSit',
} as const;

const isMesh = (node: Object3D): node is Mesh => 'isMesh' in node;

/** Seconds two clips blend over. */
const FADE = 0.35;
/**
 * How far the person and chair roll back from the desk before standing up (and in again after
 * sitting down), in metres: getting up right at the desk put the head and arms through it.
 */
const SCOOT = 0.4;
/** The chair, this much nearer the desk than the seat: no gap behind the person's back. */
const CHAIR_FORWARD = 0.12;
/** How far the chair rolls off as it fades away. */
const CHAIR_AWAY = 0.45;
/** Hands on the surface: apart, in from its front edge, and above it (palms), in metres. */
const HANDS_APART = 0.17;
const HANDS_IN = 0.03;
const HANDS_LIFT = 0.04;
/**
 * Sitting up while typing: degrees each spine bone leans back from the typing clip's hunch,
 * which raises and draws back the shoulders, so the arms reach less far up to the monitor.
 */
const SIT_UP = 4;
/** Hands are kept this far in front of the desk's front edge while getting up or down. */
const CLEARANCE = 0.05;

type Pose = 'seated' | 'standing' | 'rising' | 'sittingDown';

interface OccupantProps {
  product: ProductDefinition;
  deskId: string;
  /** The desk's group: the occupant follows it (the room moves desks around). */
  desk: RefObject<Group | null>;
  /** The desk's model (its screens and desk top, for the hands). */
  index: ReadonlyMap<string, Object3D>;
  /** The desk's front edge, metres in front of its centre. */
  front: number;
  visible: boolean;
}

/**
 * Someone working at a desk (product.json `occupant`): on a chair in front of it, typing with
 * the hands on the desk monitor (or the desk top) while the desk is low, getting up once it
 * rises past `standFrom` and sitting back down when it comes down. Drawn outside the framed
 * scene, following the desk, so the camera frames the desk as before.
 */
export function Occupant(props: OccupantProps) {
  const scene = useThree((s) => s.scene);
  const occupant = props.product.occupant;
  if (!occupant) return null;
  const character = characterUrl(occupant.character);
  if (!character) {
    console.warn(`[configurator] no characters/${occupant.character}/character.glb`);
    return null;
  }
  const chair = occupant.chair ? propUrl(occupant.chair) : undefined;
  return createPortal(
    <Suspense fallback={null}>
      <Follow desk={props.desk} visible={props.visible}>
        {(space) => (
          <Seat
            {...props}
            character={character}
            chair={chair}
            standFrom={occupant.standFrom}
            seatZ={props.front + occupant.distance}
            space={space}
          />
        )}
      </Follow>
    </Suspense>,
    scene,
  );
}

/** A group that keeps to the desk's place in the world: the desk's own space. */
function Follow({
  desk,
  visible,
  children,
}: {
  desk: RefObject<Group | null>;
  visible: boolean;
  children: (space: RefObject<Group | null>) => ReactNode;
}) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const own = group.current;
    const anchor = desk.current;
    if (!own || !anchor) return;
    anchor.updateWorldMatrix(true, false);
    own.matrix.copy(anchor.matrixWorld);
    own.matrixWorldNeedsUpdate = true;
  }, -1);
  return (
    <group ref={group} matrixAutoUpdate={false} visible={visible}>
      {children(group)}
    </group>
  );
}

const smooth = (from: number, to: number, x: number) => MathUtils.smoothstep(x, from, to);

function Seat({
  product,
  deskId,
  index,
  character,
  chair: chairSrc,
  standFrom,
  seatZ,
  space,
}: OccupantProps & {
  character: string;
  chair: string | undefined;
  standFrom: number;
  seatZ: number;
  space: RefObject<Group | null>;
}) {
  const { scene, animations } = useGLTF(character);
  const invalidate = useThree((s) => s.invalidate);
  // Each desk's person is a copy with its own skeleton.
  const person = useMemo(() => {
    const copy = clone(scene);
    // Hair cards: their faint strands drawn partly covering (multisampling) rather than cut
    // at a threshold, which close up (the texture at full detail) cut most of the hair away.
    copy.traverse((node) => {
      if (!isMesh(node)) return;
      // Always drawn: a skinned mesh's bounds are measured once, in whatever pose it was in,
      // and once she sat the hair's stale bounds left the view up close: it vanished.
      node.frustumCulled = false;
      for (const material of [node.material].flat()) {
        if (material.alphaTest > 0 && !material.alphaToCoverage) {
          material.alphaToCoverage = true;
          material.alphaTest = 0.05;
          material.needsUpdate = true;
        }
      }
    });
    return copy;
  }, [scene]);
  const arms = useMemo(() => findArms(person), [person]);
  const spine = useMemo(() => {
    const bones: Object3D[] = [];
    person.traverse((node) => {
      if (/Spine\d?$/.test(node.name)) bones.push(node);
    });
    return bones;
  }, [person]);
  const mixer = useMemo(() => new AnimationMixer(person), [person]);
  const actions = useMemo(() => {
    const byName = new Map(animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const pick = (name: string) => byName.get(name);
    return {
      working: pick(CLIPS.working) ?? pick(CLIPS.seated),
      standing: pick(CLIPS.standing),
      rising: pick(CLIPS.rising),
      sittingDown: pick(CLIPS.sittingDown),
    };
  }, [animations, mixer]);

  const motion = product.motions[0];
  const heightNow = () => {
    if (!motion) return 0;
    const current = useMotionStore.getState().current[motionKey(deskId, motion.id)];
    if (current !== undefined) return current;
    const setup = useSetupStore.getState();
    const desk = setup.room.find((d) => d.id === deskId) ?? setup.single;
    return desk.motions[motion.id] ?? motion.initial ?? motion.min;
  };

  // Seated or standing as the desk is when it appears: no getting up on the way in.
  const [initial] = useState<Pose>(() => (heightNow() >= standFrom ? 'standing' : 'seated'));
  const pose = useRef<Pose>(initial);
  const playing = useRef<AnimationAction | null>(null);
  /** How much the hands are placed on the surface (0 while standing). */
  const handsOn = useRef(initial === 'seated' ? 1 : 0);
  const chairGroup = useRef<Group>(null);
  const chairMaterials = useRef<Material[]>([]);

  const play = (action: AnimationAction | undefined, once: boolean) => {
    if (!action) return;
    action.reset();
    action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.play();
    if (playing.current && playing.current !== action) {
      playing.current.crossFadeTo(action, FADE, false);
    }
    playing.current = action;
  };

  useEffect(() => {
    play(pose.current === 'standing' ? actions.standing : actions.working, false);
    // A transition done: settle into what it led to.
    const onFinished = () => {
      if (pose.current === 'rising') {
        pose.current = 'standing';
        play(actions.standing, false);
      } else if (pose.current === 'sittingDown') {
        pose.current = 'seated';
        play(actions.working, false);
      }
    };
    mixer.addEventListener('finished', onFinished);
    return () => {
      mixer.removeEventListener('finished', onFinished);
      mixer.stopAllAction();
    };
  }, [mixer, actions]);

  const toDesk = useMemo(() => new Matrix4(), []);
  const target = useMemo(() => new Vector3(), []);
  const hand = useMemo(() => new Vector3(), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const stand = heightNow() >= standFrom;
    if (pose.current === 'seated' && stand && actions.rising) {
      pose.current = 'rising';
      play(actions.rising, true);
    } else if (pose.current === 'standing' && !stand && actions.sittingDown) {
      pose.current = 'sittingDown';
      play(actions.sittingDown, true);
    }
    mixer.update(dt);

    // Getting up: roll back with the chair first, then the chair fades off. Sitting down: the
    // chair fades in behind, and both roll in once seated.
    const action = playing.current;
    const progress = action ? action.time / Math.max(1e-6, action.getClip().duration) : 1;
    let scoot = 0;
    let chairShown = 1;
    let chairAway = 0;
    switch (pose.current) {
      case 'seated':
        break;
      case 'standing':
        scoot = SCOOT;
        chairShown = 0;
        break;
      case 'rising':
        scoot = SCOOT * smooth(0, 0.3, progress);
        chairShown = 1 - smooth(0.45, 0.85, progress);
        chairAway = smooth(0.45, 1, progress);
        break;
      case 'sittingDown':
        scoot = SCOOT * (1 - smooth(0.78, 1, progress));
        chairShown = smooth(0.05, 0.5, progress);
        chairAway = 1 - smooth(0.05, 0.55, progress);
        break;
    }
    person.position.z = -scoot;
    const chairObject = chairGroup.current;
    if (chairObject) {
      chairObject.position.z = CHAIR_FORWARD - scoot - chairAway * CHAIR_AWAY;
      chairObject.visible = chairShown > 0.01;
      const fading = chairShown < 0.99;
      for (const material of chairMaterials.current) {
        material.opacity = chairShown;
        // Switching transparency changes the material's shader: it must be rebuilt, or the
        // chair kept the see-through one once it was solid again (its fabric looked washed out).
        // While fading: front faces only, still writing depth, so the nearest surface hides
        // the rest and it fades as one solid. Double-sided and without depth, its inside and
        // back faces showed through in no particular order.
        if (material.transparent !== fading) {
          material.transparent = fading;
          material.side = fading ? FrontSide : (material.userData.side as Side);
          material.needsUpdate = true;
        }
      }
    }

    // Sitting up straighter while typing (eased in and out with the hands).
    for (const bone of spine) bone.rotateX((-SIT_UP * Math.PI * handsOn.current) / 180);

    // Hands: on the surface while seated (eased in and out), clear of the desk while getting
    // up or down. Worked out in the desk's space, where its front is +Z.
    const deskSpace = space.current;
    if (deskSpace && arms.length > 0) {
      person.updateWorldMatrix(true, true);
      toDesk.copy(deskSpace.matrixWorld).invert();
      const surface = deskSurface(product, index, toDesk);
      handsOn.current = MathUtils.damp(handsOn.current, pose.current === 'seated' ? 1 : 0, 6, dt);
      arms.forEach((arm, i) => {
        if (!surface) return;
        // Facing the desk (−Z), the left hand is towards −X.
        const side = i === 0 ? -1 : 1;
        const apart = Math.min(HANDS_APART, surface.width / 2 - 0.05);
        if (handsOn.current > 0.001) {
          target
            .copy(surface.front)
            .addScaledVector(surface.along, side * apart)
            .addScaledVector(surface.inward, HANDS_IN)
            .addScaledVector(surface.up, HANDS_LIFT)
            .applyMatrix4(deskSpace.matrixWorld);
          reach(arm, target, handsOn.current);
        }
        if (pose.current === 'rising' || pose.current === 'sittingDown') {
          // A hand past the desk's front edge and below its top goes back in front of it.
          arm.hand.getWorldPosition(hand);
          hand.applyMatrix4(toDesk);
          const edge = surface.front.z + CLEARANCE;
          if (hand.z < edge && hand.y < surface.front.y + 0.05) {
            hand.z = edge;
            reach(arm, hand.applyMatrix4(deskSpace.matrixWorld), 1);
          }
        }
      });
    }
    // Always moving (breathing, typing): keep frames coming while it is on show.
    invalidate();
  });

  return (
    <group position={[0, 0, seatZ]} rotation={[0, Math.PI, 0]}>
      <primitive object={person} />
      {chairSrc && (
        <group ref={chairGroup}>
          <Chair src={chairSrc} materials={chairMaterials} />
        </group>
      )}
    </group>
  );
}

/** The chair, with its own materials so it can fade without fading other desks' chairs. */
function Chair({ src, materials }: { src: string; materials: RefObject<Material[]> }) {
  const { scene } = useGLTF(src);
  const chair = useMemo(() => {
    const copy = scene.clone(true);
    const own: Material[] = [];
    copy.traverse((node) => {
      if (!isMesh(node)) return;
      const mesh = node;
      const cloned = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
      mesh.material = cloned;
      for (const material of [cloned].flat()) {
        material.userData.side = material.side;
        own.push(material);
      }
    });
    materials.current = own;
    return copy;
  }, [scene, materials]);
  return <primitive object={chair} />;
}
