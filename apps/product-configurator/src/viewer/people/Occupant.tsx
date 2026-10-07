import { useGLTF } from '@react-three/drei';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type Group } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ProductDefinition } from '@/catalog/schema';
import { motionKey, useMotionStore } from '@/state/motionStore';
import { useSetupStore } from '@/state/setupStore';
import { characterUrl, propUrl } from './assets';

/** Clips by role; characters/<Name>'s clips are named after their Mixamo files. */
const CLIPS = {
  working: 'typing',
  seated: 'sittingIdle',
  standing: 'standingIdle',
  rising: 'sitToStand',
  sittingDown: 'standToSit',
} as const;

/** Seconds two clips blend over. */
const FADE = 0.35;

interface OccupantProps {
  product: ProductDefinition;
  deskId: string;
  /** The desk's group: the occupant follows it (the room moves desks around). */
  desk: RefObject<Group | null>;
  /** The desk's front edge, metres in front of its centre. */
  front: number;
  visible: boolean;
}

/**
 * Someone working at a desk (product.json `occupant`): on a chair in front of it, typing while
 * the desk is low, getting up once it rises past `standFrom` and sitting back down when it
 * comes down again. Drawn outside the framed scene, following the desk, so the camera frames
 * the desk as before.
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
        <group position={[0, 0, props.front + occupant.distance]} rotation={[0, Math.PI, 0]}>
          <Person
            src={character}
            deskId={props.deskId}
            product={props.product}
            standFrom={occupant.standFrom}
          />
          {chair && <Chair src={chair} />}
        </group>
      </Follow>
    </Suspense>,
    scene,
  );
}

/** A group that keeps to the desk's place in the world. */
function Follow({
  desk,
  visible,
  children,
}: {
  desk: RefObject<Group | null>;
  visible: boolean;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const own = group.current;
    const anchor = desk.current;
    if (!own || !anchor) return;
    anchor.updateWorldMatrix(true, false);
    own.matrix.copy(anchor.matrixWorld);
  });
  return (
    <group ref={group} matrixAutoUpdate={false} visible={visible}>
      {children}
    </group>
  );
}

function Chair({ src }: { src: string }) {
  const { scene } = useGLTF(src);
  const chair = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={chair} />;
}

function Person({
  src,
  deskId,
  product,
  standFrom,
}: {
  src: string;
  deskId: string;
  product: ProductDefinition;
  standFrom: number;
}) {
  const { scene, animations } = useGLTF(src);
  const invalidate = useThree((s) => s.invalidate);
  // Each desk's person is a copy with its own skeleton.
  const person = useMemo(() => clone(scene), [scene]);
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

  /** Seated (working), standing, or on the way between. */
  const pose = useRef<'seated' | 'standing' | 'rising' | 'sittingDown'>(
    heightNow() >= standFrom ? 'standing' : 'seated',
  );
  const playing = useRef<AnimationAction | null>(null);

  const play = (action: AnimationAction | undefined, once: boolean) => {
    if (!action) return;
    action.reset();
    action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.play();
    if (playing.current && playing.current !== action)
      playing.current.crossFadeTo(action, FADE, false);
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

  useFrame((_, delta) => {
    const stand = heightNow() >= standFrom;
    if (pose.current === 'seated' && stand && actions.rising) {
      pose.current = 'rising';
      play(actions.rising, true);
    } else if (pose.current === 'standing' && !stand && actions.sittingDown) {
      pose.current = 'sittingDown';
      play(actions.sittingDown, true);
    }
    mixer.update(Math.min(delta, 0.1));
    // Always moving (breathing, typing): keep frames coming while it is on show.
    invalidate();
  });

  return <primitive object={person} />;
}
