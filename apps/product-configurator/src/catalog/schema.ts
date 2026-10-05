/**
 * Catalog schema: the internal shape of a product.
 *
 * Definitions are not written by hand. The `catalog` Vite plugin derives them from each
 * `products/<id>/` folder (object names, material images, product.json); this schema
 * validates the result and gives the rest of the app its types. The UI and the viewer are
 * driven entirely by this data, so adding a product never requires code changes.
 */
import { z } from 'zod';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

const identifier = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');

/** A glTF model URL, with an optional correction transform. */
export const modelSchema = z.object({
  src: z.string().min(1),
  scale: z.number().positive().default(1),
  position: vec3.default([0, 0, 0]),
  /** Euler rotation in radians. */
  rotation: vec3.default([0, 0, 0]),
});

export const materialPresetSchema = z.object({
  /** CSS-style hex colour, e.g. `#c9a27a`; multiplies the colour map when there is one. */
  color: z.string().regex(/^#([0-9a-f]{6})$/i, 'expected a #rrggbb colour'),
  roughness: z.number().min(0).max(1).default(0.5),
  metalness: z.number().min(0).max(1).default(0),
  /** PBR maps. A packed ARM/ORM image may fill aoMap, roughnessMap and metalnessMap at once. */
  textureMaps: z
    .object({
      map: z.string().optional(),
      normalMap: z.string().optional(),
      roughnessMap: z.string().optional(),
      metalnessMap: z.string().optional(),
      aoMap: z.string().optional(),
    })
    .optional(),
  /** How often the maps repeat across the UV map, per axis. */
  repeat: z.tuple([z.number().positive(), z.number().positive()]).default([1, 1]),
  /** Map rotation in degrees, around the UV centre. */
  rotation: z.number().default(0),
  /** Normal map strength per axis; a negative y reads DirectX-style normal maps. */
  normalScale: z.tuple([z.number(), z.number()]).default([1, 1]),
});

export const partDefinitionSchema = z.object({
  id: identifier,
  label: z.string().min(1),
  /** Blender object names that make up this part. Children of an object are included. */
  nodes: z.array(z.string().min(1)).min(1),
  /** Parts that may be hidden (by a toggle group) must be flagged optional. */
  optional: z.boolean().default(false),
});

const optionBase = z.object({
  id: identifier,
  label: z.string().min(1),
  /** Price difference relative to `basePrice`, in the product currency. */
  priceDelta: z.number().default(0),
  /** Optional image URL for the option (falls back to a colour swatch for materials). */
  thumbnail: z.string().optional(),
});

const groupBase = z.object({
  id: identifier,
  label: z.string().min(1),
  description: z.string().optional(),
  defaultOptionId: identifier,
});

/** Shows the option's parts and hides every other part referenced by the group. */
export const variantGroupSchema = groupBase.extend({
  type: z.literal('variant'),
  options: z.array(optionBase.extend({ parts: z.array(identifier).min(1) })).min(1),
});

/**
 * Re-finishes every mesh that uses the Blender material `materialName`. An option without
 * `material` keeps the material exactly as modelled.
 */
export const materialGroupSchema = groupBase.extend({
  type: z.literal('material'),
  materialName: z.string().min(1),
  options: z.array(optionBase.extend({ material: materialPresetSchema.optional() })).min(1),
});

/** Shows or hides a single optional part. Exactly one option must be `visible: false`. */
export const toggleGroupSchema = groupBase.extend({
  type: z.literal('toggle'),
  part: identifier,
  /** Objects whose own geometry shows only while the option is on (children unaffected). */
  whenOn: z.array(z.string()).default([]),
  /** Objects whose own geometry shows only while the option is off. */
  whenOff: z.array(z.string()).default([]),
  options: z.array(optionBase.extend({ visible: z.boolean() })).length(2),
});

/** An image, such as a logo, laid on one side of objects: a white-on-black mask. */
export const decalSchema = z.strictObject({
  image: z.string().min(1),
  /** Blender object names; each gets a copy that moves and hides with it. */
  objects: z.array(z.string().min(1)).min(1),
  /** Width in metres; the height follows the image. */
  width: z.number().positive(),
  side: z.enum(['front', 'back', 'left', 'right', 'top', 'bottom']).default('back'),
  color: z.string().default('#d8d8d8'),
  /** Shift from the centre in metres: right and up as seen looking at that side. */
  offset: z.tuple([z.number(), z.number()]).default([0, 0]),
});

export const optionGroupSchema = z.discriminatedUnion('type', [
  variantGroupSchema,
  materialGroupSchema,
  toggleGroupSchema,
]);

/**
 * A live control that moves parts, such as the height of a motorised desk. Motions are a
 * demo of how the product works: they are animated, never priced, and not part of the
 * shared configuration.
 *
 * Moving to value `v` translates each `moves` entry along `axis` by
 * `(v - modelledValue) * metresPerUnit * factor`. For a three-stage leg that means the top
 * and upper stage use factor 1, the middle stage 0.5, and the base does not move. Factors
 * are absolute: a node parented to another moved node only gets the difference.
 */
export const motionSchema = z
  .object({
    id: identifier,
    type: z.literal('linear'),
    label: z.string().min(1),
    description: z.string().optional(),
    unit: z.string().min(1),
    /** Scene metres per unit, e.g. 0.01 when the unit is cm. */
    metresPerUnit: z.number().positive(),
    min: z.number(),
    max: z.number(),
    step: z.number().positive().default(1),
    /** Value shown when the product loads; defaults to the value the model was built at. */
    initial: z.number().optional(),
    /**
     * The value the model was built at. Omit it to measure it from `referencePart`: its
     * highest point along `axis`, above the lowest point of the model (the floor).
     */
    modelledValue: z.number().optional(),
    referencePart: identifier.optional(),
    /**
     * How to read the height from the reference part: `widest` takes the top of its widest
     * mesh (nested parts skipped); `object` the top of the reference objects' own geometry.
     */
    referenceMode: z.enum(['widest', 'object']).default('widest'),
    axis: z.enum(['x', 'y', 'z']).default('y'),
    /** Units per second; defaults to crossing the whole range in three seconds. */
    speed: z.number().positive().optional(),
    moves: z.array(z.object({ parts: z.array(identifier).min(1), factor: z.number() })).min(1),
    /** Quick-select buttons, e.g. sitting and standing height. */
    presets: z
      .array(z.object({ id: identifier, label: z.string().min(1), value: z.number() }))
      .default([]),
  })
  .superRefine((motion, ctx) => {
    if (motion.min >= motion.max) {
      ctx.addIssue({ code: 'custom', path: ['max'], message: 'max must be greater than min' });
    }
    const inRange = (value: number) => value >= motion.min && value <= motion.max;
    if (motion.initial !== undefined && !inRange(motion.initial)) {
      ctx.addIssue({ code: 'custom', path: ['initial'], message: 'initial is outside min..max' });
    }
    motion.presets.forEach((preset, i) => {
      if (!inRange(preset.value)) {
        ctx.addIssue({
          code: 'custom',
          path: ['presets', i, 'value'],
          message: `preset "${preset.label}" is outside min..max`,
        });
      }
    });
    if (motion.modelledValue === undefined && motion.referencePart === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['modelledValue'],
        message: 'give either modelledValue or a referencePart to measure it from',
      });
    }
  });

/** A display surface: the mesh(es) of a monitor object using the screen material. */
export const screenSchema = z.object({
  id: identifier,
  /** Blender object name of the monitor. */
  node: z.string().min(1),
  label: z.string().min(1),
});

export const workspaceWindowSchema = z.object({
  id: identifier,
  title: z.string().min(1),
  url: z.url({ protocol: /^https$/ }),
  /** Screen id the window opens on. */
  screen: identifier,
});

/** A set of live websites placed on the screens, for the workspace demo. */
export const workspaceSchema = z.object({
  id: identifier,
  label: z.string().min(1),
  description: z.string().optional(),
  /** A short symbol for the desk switcher, e.g. an emoji. */
  icon: z.string().optional(),
  /** Theme colour of the workspace's desk, `#rrggbb`. */
  accent: z.string().optional(),
  windows: z.array(workspaceWindowSchema).min(1),
});

export const productDefinitionSchema = z
  .object({
    id: identifier,
    name: z.string().min(1),
    description: z.string().optional(),
    model: modelSchema,
    basePrice: z.number().nonnegative(),
    /** ISO 4217 code, e.g. `EUR`. */
    currency: z.string().length(3),
    parts: z.array(partDefinitionSchema),
    optionGroups: z.array(optionGroupSchema),
    motions: z.array(motionSchema).default([]),
    screens: z.array(screenSchema).default([]),
    workspaces: z.array(workspaceSchema).default([]),
    decals: z.array(decalSchema).default([]),
    /** Blender material of the display surfaces. */
    screenMaterial: z.string().min(1).default('Screen'),
    /**
     * CSS pixels per metre of screen in workspaces, the same on every screen. 1200 makes a
     * 28 cm portrait screen about 330 px wide: the narrowest layout most sites support.
     */
    pixelsPerMetre: z.number().positive().default(1200),
    /** Degrees the seated workspace view looks down when a screen lies on the desk. */
    screenTilt: z.number().min(0).max(60).default(15),
    /** Position in the product switcher; lower comes first and the first is the default. */
    order: z.number().default(100),
  })
  .superRefine((product, ctx) => {
    const partIds = new Set(product.parts.map((part) => part.id));
    const optionalParts = new Set(product.parts.filter((p) => p.optional).map((p) => p.id));
    const groupIds = new Set<string>();
    const motionIds = new Set<string>();
    const screenIds = new Set(product.screens.map((screen) => screen.id));

    const requirePart = (partId: string, path: (string | number)[]) => {
      if (!partIds.has(partId)) {
        ctx.addIssue({ code: 'custom', path, message: `unknown part "${partId}"` });
      }
    };

    product.optionGroups.forEach((group, groupIndex) => {
      const path = ['optionGroups', groupIndex];
      if (groupIds.has(group.id)) {
        ctx.addIssue({ code: 'custom', path, message: `duplicate group id "${group.id}"` });
      }
      groupIds.add(group.id);

      if (!group.options.some((option) => option.id === group.defaultOptionId)) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'defaultOptionId'],
          message: `"${group.defaultOptionId}" is not one of the group's options`,
        });
      }

      switch (group.type) {
        case 'variant':
          group.options.forEach((option, i) =>
            option.parts.forEach((partId, j) =>
              requirePart(partId, [...path, 'options', i, 'parts', j]),
            ),
          );
          break;
        case 'material':
          break;
        case 'toggle':
          requirePart(group.part, [...path, 'part']);
          if (partIds.has(group.part) && !optionalParts.has(group.part)) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'part'],
              message: `part "${group.part}" must be marked optional to be toggled`,
            });
          }
          if (group.options.filter((option) => option.visible).length !== 1) {
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'options'],
              message: 'a toggle needs exactly one visible and one hidden option',
            });
          }
          break;
      }
    });

    product.workspaces.forEach((workspace, workspaceIndex) => {
      workspace.windows.forEach((window, windowIndex) => {
        if (!screenIds.has(window.screen)) {
          ctx.addIssue({
            code: 'custom',
            path: ['workspaces', workspaceIndex, 'windows', windowIndex, 'screen'],
            message: `unknown screen "${window.screen}"`,
          });
        }
      });
    });

    product.motions.forEach((motion, motionIndex) => {
      const path = ['motions', motionIndex];
      if (motionIds.has(motion.id)) {
        ctx.addIssue({ code: 'custom', path, message: `duplicate motion id "${motion.id}"` });
      }
      motionIds.add(motion.id);
      if (motion.referencePart) requirePart(motion.referencePart, [...path, 'referencePart']);
      motion.moves.forEach((move, i) =>
        move.parts.forEach((partId, j) => requirePart(partId, [...path, 'moves', i, 'parts', j])),
      );
    });
  });

/** Input shape: what the catalog plugin produces (defaults may be omitted). */
export type ProductDefinitionInput = z.input<typeof productDefinitionSchema>;
export type PartDefinitionInput = z.input<typeof partDefinitionSchema>;
export type OptionGroupInput = z.input<typeof optionGroupSchema>;
export type MaterialPresetInput = z.input<typeof materialPresetSchema>;
export type MotionInput = z.input<typeof motionSchema>;

/** Output shape: what the app consumes (all defaults applied). */
export type ProductDefinition = z.output<typeof productDefinitionSchema>;
export type ModelDefinition = z.output<typeof modelSchema>;
export type PartDefinition = z.output<typeof partDefinitionSchema>;
export type MaterialPreset = z.output<typeof materialPresetSchema>;
export type OptionGroup = z.output<typeof optionGroupSchema>;
export type VariantGroup = z.output<typeof variantGroupSchema>;
export type MaterialGroup = z.output<typeof materialGroupSchema>;
export type ToggleGroup = z.output<typeof toggleGroupSchema>;
export type Decal = z.output<typeof decalSchema>;
export type Option = OptionGroup['options'][number];
export type Motion = z.output<typeof motionSchema>;
export type Screen = z.output<typeof screenSchema>;
export type Workspace = z.output<typeof workspaceSchema>;
export type WorkspaceWindow = z.output<typeof workspaceWindowSchema>;

/** Parses and validates a definition, returning a readable error message on failure. */
export function parseProductDefinition(
  input: unknown,
): { product: ProductDefinition; error?: never } | { product?: never; error: string } {
  const result = productDefinitionSchema.safeParse(input);
  return result.success
    ? { product: result.data }
    : { error: z.prettifyError(result.error).replaceAll('\n', ' ') };
}
