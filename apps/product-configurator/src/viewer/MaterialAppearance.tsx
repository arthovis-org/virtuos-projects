import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  Color,
  MathUtils,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type { MaterialPreset } from '@/catalog/schema';
import { isMesh } from './nodeUtils';

interface MaterialAppearanceProps {
  scene: Object3D;
  /** Blender material name; every mesh slot using it gets the preset. */
  materialName: string;
  preset: MaterialPreset;
}

type TextureMaps = NonNullable<MaterialPreset['textureMaps']>;
type LoadedTextures = Partial<Record<keyof TextureMaps, Texture>>;

const NO_TEXTURES: LoadedTextures = {};

/**
 * Re-finishes one Blender material. Each distinct original material is cloned once, the
 * preset applied to the clone, and every mesh slot that used the original switched to it;
 * the originals come back (and clones are disposed) when the choice changes.
 */
export function MaterialAppearance(props: MaterialAppearanceProps) {
  const mapCount = Object.keys(props.preset.textureMaps ?? {}).length;
  return mapCount > 0 ? (
    <TexturedAppearance {...props} />
  ) : (
    <AppearanceEffect {...props} textures={NO_TEXTURES} />
  );
}

function TexturedAppearance(props: MaterialAppearanceProps) {
  const { textureMaps } = props.preset;
  const urls = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(textureMaps ?? {}).filter((entry): entry is [string, string] =>
          Boolean(entry[1]),
        ),
      ),
    [textureMaps],
  );
  const loaded = useTexture(urls) as LoadedTextures;
  const { repeat, rotation } = props.preset;

  // The loader caches one texture per image, shared by every choice using it; each choice
  // gets its own clones so tiling and rotation stay per choice. Clones share the image, so
  // they cost no extra download or decoding.
  const textures = useMemo(() => {
    const clones = new Map<Texture, Texture>();
    const result: LoadedTextures = {};
    for (const [slot, source] of Object.entries(loaded) as [keyof TextureMaps, Texture][]) {
      let texture = clones.get(source);
      if (!texture) {
        texture = source.clone();
        // glTF UVs have their origin at the top left, unlike three's default for images.
        texture.flipY = false;
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.repeat.set(...repeat);
        texture.center.set(0.5, 0.5);
        texture.rotation = MathUtils.degToRad(rotation);
        texture.needsUpdate = true;
        clones.set(source, texture);
      }
      // Colour images are sRGB; data maps (normal, roughness, metalness, AO) stay linear.
      if (slot === 'map') texture.colorSpace = SRGBColorSpace;
      result[slot] = texture;
    }
    return result;
  }, [loaded, repeat, rotation]);

  useEffect(
    () => () => {
      for (const texture of new Set(Object.values(textures))) texture.dispose();
    },
    [textures],
  );

  return <AppearanceEffect {...props} textures={textures} />;
}

function AppearanceEffect({
  scene,
  materialName,
  preset,
  textures,
}: MaterialAppearanceProps & { textures: LoadedTextures }) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const clones = new Map<Material, MeshStandardMaterial>();
    const cloneFor = (original: Material) => {
      let clone = clones.get(original);
      if (!clone) {
        clone =
          original instanceof MeshStandardMaterial ? original.clone() : new MeshStandardMaterial();
        clone.color = new Color(preset.color);
        clone.roughness = preset.roughness;
        clone.metalness = preset.metalness;
        // The choice replaces the colour image; surface detail from the model (normal,
        // roughness, metalness, AO maps) is kept unless the choice brings its own.
        clone.map = textures.map ?? null;
        if (textures.normalMap) {
          clone.normalMap = textures.normalMap;
          clone.normalScale.set(...preset.normalScale);
        }
        if (textures.roughnessMap) clone.roughnessMap = textures.roughnessMap;
        if (textures.metalnessMap) clone.metalnessMap = textures.metalnessMap;
        if (textures.aoMap) {
          clone.aoMap = textures.aoMap;
          clone.aoMapIntensity = 1;
        }
        clone.needsUpdate = true;
        clones.set(original, clone);
      }
      return clone;
    };
    const matches = (material: Material) => material.name === materialName;

    const swapped: {
      mesh: Object3D & { material: Material | Material[] };
      original: Material | Material[];
    }[] = [];
    scene.traverse((object) => {
      if (!isMesh(object)) return;
      const original = object.material;
      if (Array.isArray(original)) {
        if (!original.some(matches)) return;
        object.material = original.map((m) => (matches(m) ? cloneFor(m) : m));
      } else {
        if (!matches(original)) return;
        object.material = cloneFor(original);
      }
      swapped.push({ mesh: object, original });
    });
    invalidate();

    return () => {
      for (const { mesh, original } of swapped) mesh.material = original;
      for (const clone of clones.values()) clone.dispose();
      invalidate();
    };
  }, [scene, materialName, preset, textures, invalidate]);

  return null;
}
