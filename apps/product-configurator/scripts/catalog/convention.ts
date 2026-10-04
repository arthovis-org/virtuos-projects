/**
 * Turns a product folder into a configurator definition, using Blender object and
 * material names as the configuration:
 *
 *   Toggle_<Name>[_...]              on/off option; several objects may share a name
 *   Variant_<Group>_<Choice>[_...]   pick one of the choices in <Group>
 *   Lift<percent>_...                moved by the height control, e.g. Lift100_Top,
 *                                    Lift50_Leg_L_Middle (tags combine: Lift100_Toggle_X)
 *   materials/<Material>/<choice>/     a PBR texture set (colour, normal, roughness,
 *                                    metalness, AO or packed ARM maps, named the way texture
 *                                    sites ship them) becomes a finish choice for every mesh
 *                                    using the Blender material <Material>; a single image
 *                                    materials/<Material>/<choice>.jpg works too
 *
 * Screens are the meshes using the Blender material `Screen`; `product.json` workspaces put
 * live websites on them for the workspace demo.
 *
 * `product.json` (optional) adds what names cannot carry: product name, prices, labels,
 * defaults, extra colour choices, the height range and workspaces. See products/README.md.
 */
import { z } from 'zod';
import type {
  ProductDefinitionInput,
  MaterialPresetInput,
  MotionInput,
  OptionGroupInput,
  PartDefinitionInput,
} from '../../src/catalog/schema.ts';
import type { GltfJson } from './gltf.ts';

/** Marks a string as a file URL; the Vite plugin turns it into an asset import. */
export const ASSET_PREFIX = '\u0000asset:';
const asset = (url: string) => `${ASSET_PREFIX}${url}`;

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];
const UNIT_METRES = { cm: 0.01, mm: 0.001, in: 0.0254 } as const;

type MapSlot = 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap';
type ChoiceMaps = Partial<Record<MapSlot, string>>;

/**
 * What a texture file is, from the words in its name. Covers the usual conventions of
 * texture sites and tools: `Wood049_2K_Color`, `_NormalGL`, `_AmbientOcclusion`
 * (ambientCG), `oak_diff_2k`, `_nor_gl_2k`, `_arm_2k` (Poly Haven), `_BaseColor`, `_ORM`
 * (Substance), and plain `walnut_normal`.
 */
type TextureKind = MapSlot | 'orm' | 'swatch' | 'unused' | 'gloss';
const TEXTURE_WORDS: [RegExp, TextureKind][] = [
  [/^(swatch|thumb|thumbnail|preview)$/, 'swatch'],
  [/^(arm|orm|occlusionroughnessmetallic)$/, 'orm'],
  [/^(ao|occlusion|ambientocclusion)$/, 'aoMap'],
  [/^(nor|nrm|norm|normal|normals|normalgl|normaldx|norgl|nordx|normalmap)$/, 'normalMap'],
  [/^(rough|roughness)$/, 'roughnessMap'],
  [/^(metal|metallic|metalness)$/, 'metalnessMap'],
  [/^(col|color|colour|diff|diffuse|albedo|basecolor|basecolour|basemap)$/, 'map'],
  [/^(gloss|glossiness|smoothness)$/, 'gloss'],
  [
    /^(disp|displacement|height|bump|opacity|alpha|mask|spec|specular|emission|emissive|cavity|translucency|idmap)$/,
    'unused',
  ],
];

/** Classifies a file name; `prefix` is the part before the keyword (the choice name). */
function classifyTexture(stem: string) {
  const words = stem.split(/[^A-Za-z0-9]+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    const word = (words[i] ?? '').toLowerCase();
    for (const [pattern, kind] of TEXTURE_WORDS) {
      if (!pattern.test(word)) continue;
      // OpenGL normals are three's convention; DirectX ones have green flipped.
      const directX =
        kind === 'normalMap' && words.some((w) => /^(dx|directx|normaldx|nordx)$/i.test(w));
      // No words before the keyword ("normal.jpg"): the file names no choice of its own.
      return { kind, directX, prefix: i > 0 ? words.slice(0, i).join('_') : undefined };
    }
  }
  return undefined;
}

interface TextureSet {
  maps: ChoiceMaps;
  swatch?: string;
  normalDirectX: boolean;
}
interface NamedNodes {
  name: string;
  nodes: string[];
}

// ---------------------------------------------------------------------------------------
// product.json

const choiceConfig = z.strictObject({
  label: z.string().optional(),
  description: z.string().optional(),
  price: z.number().optional(),
});

const configSchema = z.strictObject({
  name: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().length(3).optional(),
  basePrice: z.number().nonnegative().optional(),
  /** Position in the product switcher; lower first, and the first product is the default. */
  order: z.number().optional(),
  /** Keyed by the name used in Blender: `SideMonitors` for Toggle_SideMonitors, `Legs` for Variant_Legs_*. */
  options: z
    .record(
      z.string(),
      z.strictObject({
        label: z.string().optional(),
        description: z.string().optional(),
        /** Toggle: price when switched on. */
        price: z.number().optional(),
        /** Toggle: on or off initially. Variant: the choice selected initially. */
        default: z.union([z.boolean(), z.string()]).optional(),
        /** Variant: per-choice labels and prices, keyed by the choice name from Blender. */
        choices: z.record(z.string(), choiceConfig).optional(),
        /**
         * Toggle: other toggles switched together with this one, e.g. "SideMonitors" with
         * ["MonitorLeft", "MonitorRight"]. The key then names a new, combined option.
         */
        includes: z.array(z.string()).optional(),
        /**
         * Toggle: objects modelled in both versions, e.g. a back plate with and without the
         * side monitor mounts. `on` objects show only while the option is on, `off` objects
         * only while it is off. Only the object's own geometry is swapped; its children stay.
         */
        parts: z
          .strictObject({
            on: z.array(z.string()).optional(),
            off: z.array(z.string()).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  /**
   * Images laid on objects, such as a logo: a white-on-black mask from images/, centred on
   * one side of each object's own geometry.
   */
  decals: z
    .array(
      z.strictObject({
        /** Path inside the product folder, e.g. "images/logo.png". White shows, black doesn't. */
        image: z.string(),
        /** Blender object names to put it on (each gets a copy; hidden with its object). */
        objects: z.array(z.string()).min(1),
        /** Width in metres; the height follows the image. */
        width: z.number().positive(),
        /** Side of the object, in the model's directions (front faces +Z). Default back. */
        side: z.enum(['front', 'back', 'left', 'right', 'top', 'bottom']).optional(),
        /** Colour of the image (default light grey). */
        color: z.string().optional(),
        /** Shift from the centre in metres: [right, up] as seen looking at that side. */
        offset: z.tuple([z.number(), z.number()]).optional(),
      }),
    )
    .optional(),
  /** Keyed by Blender material name. */
  materials: z
    .record(
      z.string(),
      z.strictObject({
        label: z.string().optional(),
        description: z.string().optional(),
        default: z.string().optional(),
        /** Label of the "as modelled" choice, or false to leave it out. */
        original: z.union([z.literal(false), z.string()]).optional(),
        /** Extra choices (colours) or settings for image choices, keyed by choice id. */
        choices: z
          .record(
            z.string(),
            choiceConfig.extend({
              /** Colour-only choice, or a tint multiplied with the colour map. */
              color: z
                .string()
                .regex(/^#[0-9a-f]{6}$/i, 'expected #rrggbb')
                .optional(),
              roughness: z.number().min(0).max(1).optional(),
              metalness: z.number().min(0).max(1).optional(),
              /** How often the textures repeat across the UV map: 2, or [u, v]. */
              repeat: z
                .union([
                  z.number().positive(),
                  z.tuple([z.number().positive(), z.number().positive()]),
                ])
                .optional(),
              /** Texture rotation in degrees, e.g. 90 to turn the wood grain. */
              rotation: z.number().optional(),
              /** Strength of the normal map (1 = as authored). */
              normalScale: z.number().optional(),
              /** For a DirectX-style normal map whose name does not say so (…_dx, NormalDX). */
              normalDirectX: z.boolean().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  height: z
    .strictObject({
      label: z.string().optional(),
      description: z.string().optional(),
      unit: z.enum(['cm', 'mm', 'in']).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      initial: z.number().optional(),
      step: z.number().positive().optional(),
      /** Height the model was built at; measured from the reference object when omitted. */
      modelled: z.number().optional(),
      /** Object whose top is the height (default: the Lift object named like "top"/"desk"). */
      reference: z.string().optional(),
      speed: z.number().positive().optional(),
      presets: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  /** Screens are found by material; these settings adjust how they are used. */
  screens: z
    .strictObject({
      /** Blender material of the display surfaces (default "Screen"). */
      material: z.string().optional(),
      /** CSS pixels per metre of screen, the same on every screen (default 1200). */
      pixelsPerMetre: z.number().positive().optional(),
      /**
       * Degrees the seated view looks down when a screen lies on the desk (default 15; 0 looks
       * straight at the main screen).
       */
      tilt: z.number().min(0).max(60).optional(),
      /** Display names, keyed by the monitor object name from Blender. */
      labels: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  /** Live websites on the screens, keyed by workspace id: "office": { windows: [...] }. */
  workspaces: z
    .record(
      z.string(),
      z.strictObject({
        label: z.string().optional(),
        description: z.string().optional(),
        windows: z
          .array(
            z.strictObject({
              title: z.string().min(1),
              url: z.url({ protocol: /^https$/, error: 'expected an https:// URL' }),
              /** Monitor object name from Blender, e.g. "MainMonitor" or "MonitorLeft". */
              screen: z.string().min(1),
            }),
          )
          .min(1, 'a workspace needs at least one window'),
      }),
    )
    .optional(),
});

type ProductConfig = z.output<typeof configSchema>;

// ---------------------------------------------------------------------------------------
// Names

/** `SideMonitors` / `side_monitors` / `TShape` -> `Side monitors` / `T shape`. */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Catalog ids are lowercase with dashes: `SideMonitors` -> `side-monitors`. */
export function toId(name: string): string {
  return (
    name
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  );
}

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface NodeTags {
  /** Share of the height change this node moves by, 1 = 100 %. */
  lift?: number;
  toggle?: string;
  variant?: { group: string; choice: string };
}

/** Reads leading tags from an object name: `Lift100_Toggle_SideMonitors_Left`. */
export function parseTags(name: string): NodeTags {
  const tokens = name.split('_');
  const tags: NodeTags = {};
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i] ?? '';
    const lift = /^lift(\d+)$/i.exec(token);
    if (lift && tags.lift === undefined) {
      tags.lift = Number(lift[1]) / 100;
      i += 1;
    } else if (/^toggle$/i.test(token) && tokens[i + 1] && !tags.toggle) {
      tags.toggle = tokens[i + 1];
      i += 2;
    } else if (/^variant$/i.test(token) && tokens[i + 1] && tokens[i + 2] && !tags.variant) {
      tags.variant = { group: tokens[i + 1] ?? '', choice: tokens[i + 2] ?? '' };
      i += 3;
    } else {
      break;
    }
  }
  return tags;
}

/**
 * The object name without its configurator tags, for display and matching:
 * `Lift100_Toggle_MonitorLeft` -> `MonitorLeft`.
 */
export function untagged(name: string): string {
  const tokens = name.split('_');
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i] ?? '';
    if (/^lift\d+$/i.test(token) || /^toggle$/i.test(token)) i += 1;
    else if (/^variant$/i.test(token) && tokens.length - i > 2) i += 2;
    else break;
  }
  return tokens.slice(i).join('_') || name;
}

/** Finds a config entry by name, ignoring case and separators; remembers what was used. */
function lookup<T>(record: Record<string, T> | undefined, name: string, used: Set<string>) {
  if (!record) return undefined;
  for (const [key, value] of Object.entries(record)) {
    if (normalize(key) === normalize(name)) {
      used.add(key);
      return value;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------
// Derivation

export interface ProductFolder {
  id: string;
  /** URL of the folder as served, e.g. `/products/smart-desk`. */
  url: string;
  modelFile: string;
  gltf: GltfJson;
  /** Raw product.json text, if the folder has one. */
  configText: string | undefined;
  /** Image files under `materials/`, relative to it: `Top/walnut.jpg`. */
  materialFiles: string[];
  /** Image files under `images/`, relative to it: `logo.png`. */
  imageFiles: string[];
}

export interface DerivedProduct {
  definition: ProductDefinitionInput;
  issues: string[];
}

export function deriveProduct(folder: ProductFolder): DerivedProduct {
  const issues: string[] = [];
  let config: ProductConfig = {};
  if (folder.configText !== undefined) {
    try {
      const parsed = configSchema.safeParse(JSON.parse(folder.configText));
      if (parsed.success) config = parsed.data;
      else issues.push(`product.json: ${z.prettifyError(parsed.error).replaceAll('\n', ' ')}`);
    } catch (error) {
      issues.push(`product.json is not valid JSON: ${(error as Error).message}`);
    }
  }
  const usedOptions = new Set<string>();
  const usedMaterials = new Set<string>();

  // --- Object names -> parts --------------------------------------------------------
  const toggles = new Map<string, NamedNodes>();
  const variants = new Map<string, { name: string; choices: Map<string, NamedNodes> }>();
  const lifts = new Map<number, string[]>();
  const nodeNames = (folder.gltf.nodes ?? []).map((node) => node.name ?? '').filter(Boolean);

  for (const name of nodeNames) {
    const tags = parseTags(name);
    if (tags.toggle) {
      const key = normalize(tags.toggle);
      const entry = toggles.get(key) ?? { name: tags.toggle, nodes: [] };
      entry.nodes.push(name);
      toggles.set(key, entry);
    }
    if (tags.variant) {
      const key = normalize(tags.variant.group);
      const group = variants.get(key) ?? {
        name: tags.variant.group,
        choices: new Map<string, NamedNodes>(),
      };
      const choiceKey = normalize(tags.variant.choice);
      const choice = group.choices.get(choiceKey) ?? { name: tags.variant.choice, nodes: [] };
      choice.nodes.push(name);
      group.choices.set(choiceKey, choice);
      variants.set(key, group);
    }
    if (tags.lift !== undefined) lifts.set(tags.lift, [...(lifts.get(tags.lift) ?? []), name]);
  }

  const parts: PartDefinitionInput[] = [];
  const optionGroups: OptionGroupInput[] = [];

  // --- Materials: materials/<Material>/<choice>[_map].ext + product.json colours --------
  const materialNames = [
    ...new Set((folder.gltf.materials ?? []).map((m) => m.name ?? '').filter(Boolean)),
  ];
  const sets = new Map<string, Map<string, TextureSet>>();
  const strayFolders = new Set<string>();
  for (const file of folder.materialFiles) {
    const segments = file.split('/');
    const dir = segments[0] ?? '';
    const material = materialNames.find((m) => normalize(m) === normalize(dir));
    if (!material) {
      // Report each stray folder once, with the likely fix: a texture set placed directly
      // in materials/ instead of materials/<Material>/.
      if (!strayFolders.has(dir)) {
        strayFolders.add(dir);
        issues.push(
          segments.length === 2
            ? `materials/${dir}/ is not a Blender material (${materialNames.join(', ')}). If it is a texture set, move it into the folder of the material it should re-finish: materials/<Material>/${dir}/`
            : `materials/${dir}/ does not match a material in the model (${materialNames.join(', ') || 'none'})`,
        );
      }
      continue;
    }
    const base = segments[segments.length - 1] ?? '';
    const stem = base.slice(0, base.lastIndexOf('.'));
    const found = classifyTexture(stem);
    // materials/<Material>/<choice>/<any file>, or materials/<Material>/<choice>[_map].jpg
    const inFolder = segments.length >= 3;
    const choice = inFolder ? (segments[1] ?? '') : (found?.prefix ?? stem);
    if (!choice) continue;

    const byChoice = sets.get(material) ?? new Map<string, TextureSet>();
    const set: TextureSet = byChoice.get(choice) ?? { maps: {}, normalDirectX: false };
    const url = asset(`${folder.url}/materials/${file}`);
    // A lone image without a keyword (materials/Top/walnut.jpg) is a colour map.
    const kind: TextureKind | undefined = found?.kind ?? (inFolder ? undefined : 'map');
    switch (kind) {
      case undefined:
        issues.push(
          `materials/${file}: can't tell which map this is; name it like …_color, …_normal, …_roughness, …_metalness, …_ao or …_arm`,
        );
        break;
      case 'gloss':
        issues.push(
          `materials/${file}: glossiness is inverted roughness; use a roughness map instead`,
        );
        break;
      case 'unused':
        break;
      case 'swatch':
        set.swatch = url;
        break;
      case 'orm':
        // Packed like glTF: R = occlusion, G = roughness, B = metalness. three reads exactly
        // those channels, so one image serves all three slots; separate maps win.
        set.maps.aoMap ??= url;
        set.maps.roughnessMap ??= url;
        set.maps.metalnessMap ??= url;
        break;
      default:
        set.maps[kind] = url;
        if (kind === 'normalMap') set.normalDirectX = found?.directX ?? false;
    }
    byChoice.set(choice, set);
    sets.set(material, byChoice);
  }

  for (const material of materialNames) {
    const settings = lookup(config.materials, material, usedMaterials);
    const textureChoices = sets.get(material) ?? new Map<string, TextureSet>();
    const configChoices = settings?.choices ?? {};
    if (textureChoices.size === 0 && Object.keys(configChoices).length === 0) continue;

    const options: Extract<OptionGroupInput, { type: 'material' }>['options'] = [];
    if (settings?.original !== false) {
      options.push({ id: 'original', label: settings?.original ?? 'As modelled' });
    }
    const choiceIds = new Set<string>();
    for (const [choice, set] of textureChoices) {
      const extra = lookup(configChoices, choice, new Set());
      const id = toId(choice);
      choiceIds.add(id);
      const { maps } = set;
      if (!maps.map && !extra?.color) {
        issues.push(
          `materials/${material}/${choice}: no colour map found (…_color, …_basecolor, …_diff) and no colour in product.json`,
        );
        continue;
      }
      const repeat = extra?.repeat ?? 1;
      const flip = (extra?.normalDirectX ?? set.normalDirectX) ? -1 : 1;
      const strength = extra?.normalScale ?? 1;
      const preset: MaterialPresetInput = {
        color: extra?.color ?? '#ffffff',
        // With a map the factor multiplies it, so 1 means "exactly as the map says".
        roughness: extra?.roughness ?? (maps.roughnessMap ? 1 : 0.6),
        metalness: extra?.metalness ?? (maps.metalnessMap ? 1 : 0),
        textureMaps: maps,
        repeat: typeof repeat === 'number' ? [repeat, repeat] : repeat,
        rotation: extra?.rotation ?? 0,
        normalScale: [strength, strength * flip],
      };
      const swatch = set.swatch ?? maps.map;
      options.push({
        id,
        label: extra?.label ?? humanize(choice),
        ...(extra?.price !== undefined && { priceDelta: extra.price }),
        ...(swatch && { thumbnail: swatch }),
        material: preset,
      });
    }
    for (const [choice, extra] of Object.entries(configChoices)) {
      const id = toId(choice);
      if (choiceIds.has(id)) continue;
      if (!extra.color) {
        issues.push(
          `product.json: materials.${material}.choices.${choice} has no textures and no colour`,
        );
        continue;
      }
      options.push({
        id,
        label: extra.label ?? humanize(choice),
        ...(extra.price !== undefined && { priceDelta: extra.price }),
        material: {
          color: extra.color,
          roughness: extra.roughness ?? 0.6,
          metalness: extra.metalness ?? 0,
        },
      });
    }
    const first = options[0];
    if (!first) continue;
    const wanted = settings?.default ? toId(settings.default) : first.id;
    if (!options.some((o) => o.id === wanted))
      issues.push(
        `product.json: materials.${material}.default "${settings?.default}" is not a choice`,
      );
    optionGroups.push({
      id: `material-${toId(material)}`,
      type: 'material',
      label: settings?.label ?? humanize(material),
      ...(settings?.description && { description: settings.description }),
      materialName: material,
      defaultOptionId: options.some((o) => o.id === wanted) ? wanted : first.id,
      options,
    });
  }

  // --- Variants ------------------------------------------------------------------------
  for (const group of variants.values()) {
    const settings = lookup(config.options, group.name, usedOptions);
    const groupId = toId(group.name);
    if (group.choices.size < 2) {
      issues.push(`Variant_${group.name} has one choice only; use Toggle_${group.name} for on/off`);
    }
    const options = [...group.choices.values()].map((choice) => {
      const partId = `variant-${groupId}-${toId(choice.name)}`;
      parts.push({ id: partId, label: humanize(choice.name), nodes: choice.nodes });
      const extra = lookup(settings?.choices, choice.name, new Set());
      return {
        id: toId(choice.name),
        label: extra?.label ?? humanize(choice.name),
        ...(extra?.price !== undefined && { priceDelta: extra.price }),
        parts: [partId],
      };
    });
    const wanted = typeof settings?.default === 'string' ? toId(settings.default) : options[0]?.id;
    if (typeof settings?.default === 'string' && !options.some((o) => o.id === wanted)) {
      issues.push(
        `product.json: options.${group.name}.default "${settings.default}" is not a choice`,
      );
    }
    optionGroups.push({
      id: `variant-${groupId}`,
      type: 'variant',
      label: settings?.label ?? humanize(group.name),
      ...(settings?.description && { description: settings.description }),
      defaultOptionId: options.some((o) => o.id === wanted)
        ? (wanted ?? '')
        : (options[0]?.id ?? ''),
      options,
    });
  }

  // --- Toggles -------------------------------------------------------------------------
  // product.json may combine toggles into one option ("includes"). The combined option
  // takes the place of the first toggle it absorbs, so the panel order follows the model.
  const combinedInto = new Map<string, string>();
  for (const [key, settings] of Object.entries(config.options ?? {})) {
    for (const name of settings.includes ?? []) {
      if (toggles.has(normalize(name))) combinedInto.set(normalize(name), key);
      else {
        issues.push(
          `product.json: options.${key}.includes "${name}" matches no Toggle_${name} object`,
        );
      }
    }
  }
  const panelToggles = new Map<string, NamedNodes>();
  for (const [key, toggle] of toggles) {
    const target = combinedInto.get(key);
    if (!target) {
      const existing = panelToggles.get(key);
      if (existing) existing.nodes.unshift(...toggle.nodes);
      else panelToggles.set(key, toggle);
      continue;
    }
    const combined = panelToggles.get(normalize(target)) ?? { name: target, nodes: [] };
    combined.nodes.push(...toggle.nodes);
    panelToggles.set(normalize(target), combined);
  }

  /** The Blender name `name` refers to (case and underscores don't matter), or an issue. */
  const objectNamed = (name: string, where: string) => {
    const found = nodeNames.find((n) => normalize(n) === normalize(name));
    if (!found) issues.push(`product.json: ${where} "${name}" matches no object in the model`);
    return found;
  };

  for (const toggle of panelToggles.values()) {
    const settings = lookup(config.options, toggle.name, usedOptions);
    const id = toId(toggle.name);
    const swap = (side: 'on' | 'off') =>
      (settings?.parts?.[side] ?? [])
        .map((name) => objectNamed(name, `options.${toggle.name}.parts.${side}`))
        .filter((name): name is string => name !== undefined);
    parts.push({
      id: `toggle-${id}`,
      label: humanize(toggle.name),
      nodes: toggle.nodes,
      optional: true,
    });
    optionGroups.push({
      id: `toggle-${id}`,
      type: 'toggle',
      label: settings?.label ?? humanize(toggle.name),
      ...(settings?.description && { description: settings.description }),
      part: `toggle-${id}`,
      whenOn: swap('on'),
      whenOff: swap('off'),
      defaultOptionId: settings?.default === false ? 'without' : 'with',
      options: [
        { id: 'without', label: 'None', visible: false },
        {
          id: 'with',
          label: 'Included',
          visible: true,
          ...(settings?.price !== undefined && { priceDelta: settings.price }),
        },
      ],
    });
  }

  // --- Height --------------------------------------------------------------------------
  const motions: MotionInput[] = [];
  const height = config.height;
  if (lifts.size > 0) {
    for (const [factor, nodes] of lifts)
      parts.push({
        id: `lift-${Math.round(factor * 100)}`,
        label: `Lift ${Math.round(factor * 100)} %`,
        nodes,
      });
    // The viewer reads the height from the widest mesh under the most-lifted objects (the
    // desk top), unless product.json names the object to measure.
    const topFactor = Math.max(...lifts.keys());
    const reference =
      height?.reference && nodeNames.includes(height.reference)
        ? [height.reference]
        : (lifts.get(topFactor) ?? []);
    if (height?.reference && !nodeNames.includes(height.reference)) {
      issues.push(
        `product.json: height.reference "${height.reference}" is not an object in the model`,
      );
    }
    if (reference.length > 0) {
      parts.push({ id: 'height-reference', label: 'Height reference', nodes: reference });
    }

    // Defaults suit a sit-stand desk; product.json overrides any of them.
    const configured =
      height !== undefined && (height.min !== undefined || height.max !== undefined);
    const min = height?.min ?? 65;
    const max = height?.max ?? 125;
    const presets = height?.presets ?? (configured ? {} : { Sit: 72, Stand: 110 });
    motions.push({
      id: 'height',
      type: 'linear',
      label: height?.label ?? 'Height',
      ...(height?.description && { description: height.description }),
      unit: height?.unit ?? 'cm',
      metresPerUnit: UNIT_METRES[height?.unit ?? 'cm'],
      min,
      max,
      ...(height?.step !== undefined && { step: height.step }),
      // Without `initial` the desk starts at the height it was exported at.
      ...(height?.initial !== undefined && { initial: height.initial }),
      ...(height?.modelled !== undefined
        ? { modelledValue: height.modelled }
        : {
            referencePart: 'height-reference',
            referenceMode: height?.reference ? ('object' as const) : ('widest' as const),
          }),
      ...(height?.speed !== undefined && { speed: height.speed }),
      moves: [...lifts.keys()].map((factor) => ({
        parts: [`lift-${Math.round(factor * 100)}`],
        factor,
      })),
      presets: Object.entries(presets).map(([label, value]) => ({ id: toId(label), label, value })),
    });
  } else if (height) {
    issues.push(
      'product.json has "height" but no object is tagged Lift<percent>_ (e.g. Lift100_Top)',
    );
  }

  // --- Screens and workspaces --------------------------------------------------------
  const screenMaterial = config.screens?.material ?? 'Screen';
  const screenMaterialIndex = (folder.gltf.materials ?? []).findIndex(
    (m) => m.name === screenMaterial,
  );
  const screens: { id: string; node: string; label: string }[] = [];
  for (const node of folder.gltf.nodes ?? []) {
    const primitives =
      node.mesh === undefined ? [] : (folder.gltf.meshes?.[node.mesh]?.primitives ?? []);
    if (!node.name || !primitives.some((p) => p.material === screenMaterialIndex)) continue;
    const base = untagged(node.name);
    const usedLabel = new Set<string>();
    let id = toId(base);
    while (screens.some((screen) => screen.id === id)) id += '-2';
    screens.push({
      id,
      node: node.name,
      label:
        lookup(config.screens?.labels, base, usedLabel) ??
        lookup(config.screens?.labels, node.name, usedLabel) ??
        humanize(base),
    });
  }
  if (config.screens?.material && screens.length === 0) {
    issues.push(`product.json: no mesh uses the screen material "${screenMaterial}"`);
  }
  const findScreen = (name: string) =>
    screens.find((screen) => normalize(screen.node) === normalize(name)) ??
    screens.find((screen) => normalize(untagged(screen.node)) === normalize(name));

  const workspaces: {
    id: string;
    label: string;
    description?: string;
    windows: { id: string; title: string; url: string; screen: string }[];
  }[] = [];
  for (const [key, workspace] of Object.entries(config.workspaces ?? {})) {
    if (screens.length === 0) {
      issues.push(
        `product.json: workspaces.${key} needs screens, but no mesh uses the material "${screenMaterial}"`,
      );
      break;
    }
    const windows: (typeof workspaces)[number]['windows'] = [];
    for (const window of workspace.windows) {
      const screen = findScreen(window.screen);
      if (!screen) {
        issues.push(
          `product.json: workspaces.${key}: "${window.title}" is on screen "${window.screen}", which is not a screen (${screens.map((sc) => untagged(sc.node)).join(', ')})`,
        );
        continue;
      }
      let id = toId(window.title);
      while (windows.some((w) => w.id === id)) id += '-2';
      windows.push({ id, title: window.title, url: window.url, screen: screen.id });
    }
    if (windows.length > 0) {
      workspaces.push({
        id: toId(key),
        label: workspace.label ?? humanize(key),
        ...(workspace.description && { description: workspace.description }),
        windows,
      });
    }
  }

  for (const key of Object.keys(config.options ?? {})) {
    if (!usedOptions.has(key))
      issues.push(
        `product.json: options.${key} matches no Toggle_${key} or Variant_${key}_* object`,
      );
  }
  for (const key of Object.keys(config.materials ?? {})) {
    if (!usedMaterials.has(key))
      issues.push(`product.json: materials.${key} matches no material in the model`);
  }
  // --- Decals --------------------------------------------------------------------------
  const decals = (config.decals ?? []).flatMap((decal, i) => {
    const file = decal.image
      .replaceAll('\\', '/')
      .replace(/^\.?\//, '')
      .replace(/^images\//, '');
    if (!folder.imageFiles.includes(file)) {
      issues.push(`product.json: decals[${i}].image "${decal.image}" is not in images/`);
      return [];
    }
    const objects = decal.objects
      .map((name) => objectNamed(name, `decals[${i}].objects`))
      .filter((name): name is string => name !== undefined);
    return objects.length === 0
      ? []
      : [
          {
            image: asset(`${folder.url}/images/${file}`),
            objects,
            width: decal.width,
            side: decal.side ?? 'back',
            ...(decal.color && { color: decal.color }),
            ...(decal.offset && { offset: decal.offset }),
          },
        ];
  });

  if (optionGroups.length === 0 && motions.length === 0) {
    issues.push(
      'Nothing to configure yet: name objects Toggle_*, Variant_*_* or Lift*_*, or add materials/<Material>/ images',
    );
  }

  return {
    definition: {
      id: folder.id,
      name: config.name ?? humanize(folder.id),
      ...(config.description && { description: config.description }),
      model: { src: asset(`${folder.url}/${folder.modelFile}`) },
      basePrice: config.basePrice ?? 0,
      currency: config.currency ?? 'USD',
      ...(config.order !== undefined && { order: config.order }),
      parts,
      optionGroups,
      motions,
      screens,
      workspaces,
      decals,
      ...(config.screens?.material && { screenMaterial: config.screens.material }),
      ...(config.screens?.pixelsPerMetre !== undefined && {
        pixelsPerMetre: config.screens.pixelsPerMetre,
      }),
      ...(config.screens?.tilt !== undefined && { screenTilt: config.screens.tilt }),
    },
    issues,
  };
}
