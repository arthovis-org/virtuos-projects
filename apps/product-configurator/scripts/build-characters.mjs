/**
 * Builds the characters and props the scene uses from their source files:
 *
 *   characters/<Name>/source/<Name>.fbx     the character (Mixamo: FBX Binary, With Skin)
 *   characters/<Name>/source/<Clip>.fbx     its animations (Mixamo: Without Skin, same character)
 *     → characters/<Name>/character.glb     mesh, skeleton and every clip, named after its file
 *                                           ("Sit To Stand.fbx" → "sitToStand")
 *   characters/<Name>/character.json        optional: `shift`, metres to move a clip's hips by,
 *                                           so every clip measures from the same spot (the
 *                                           seat): Mixamo's standing clips start where its
 *                                           Sit To Stand ends, a step ahead of the chair
 *   props/<name>/source/<any>.glb|.gltf|.fbx
 *     → props/<name>/model.glb              in metres, standing on the floor, centred
 *   props/<name>/prop.json                  `height` in metres (default 1), `rotation` in
 *                                           degrees to turn its front to +Z
 *
 * Textures are resized and turned into WebP, so a character weighs a few MB instead of tens.
 * Run it after adding or changing a source file: `npm run build:characters`. The source
 * folders are not committed (Mixamo's files may be used in a product, not passed around).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, getBounds } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FBX2GLTF = join(
  ROOT,
  'node_modules/fbx2gltf/bin',
  process.platform === 'win32'
    ? 'Windows_NT/FBX2glTF.exe'
    : `${process.platform === 'darwin' ? 'Darwin' : 'Linux'}/FBX2glTF`,
);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const temp = mkdtempSync(join(tmpdir(), 'characters-'));

/** "Sit To Stand" → "sitToStand". */
const clipName = (file) =>
  basename(file, extname(file))
    .trim()
    .split(/[\s_-]+/)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');

/** An FBX file as a glTF document (FBX2glTF), or a glTF file as it is. */
async function load(file) {
  if (extname(file).toLowerCase() !== '.fbx') return io.read(file);
  const out = join(temp, `${Math.random().toString(36).slice(2)}`);
  execFileSync(FBX2GLTF, ['--binary', '--input', file, '--output', out], { stdio: 'pipe' });
  return io.read(`${out}.glb`);
}

/** Smaller textures as WebP: colour maps at `size`, the rest no larger. */
async function compressTextures(document, size) {
  await document.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
  );
}

/** Copies a clip's animation onto the character's skeleton (joints matched by name). */
function addClip(target, source, name) {
  const animation = source
    .getRoot()
    .listAnimations()
    .find((a) => a.listChannels().length > 0);
  if (!animation) throw new Error(`no animation in ${name}`);
  const nodes = new Map(
    target
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n]),
  );
  const buffer = target.getRoot().listBuffers()[0];
  const copy = (accessor) =>
    target
      .createAccessor()
      .setType(accessor.getType())
      .setArray(accessor.getArray().slice())
      .setBuffer(buffer);
  const clip = target.createAnimation(name);
  let channels = 0;
  for (const channel of animation.listChannels()) {
    const node = nodes.get(channel.getTargetNode()?.getName() ?? '');
    const sampler = channel.getSampler();
    if (!node || !sampler) continue;
    const copied = target
      .createAnimationSampler()
      .setInput(copy(sampler.getInput()))
      .setOutput(copy(sampler.getOutput()))
      .setInterpolation(sampler.getInterpolation());
    clip.addSampler(copied);
    clip.addChannel(
      target
        .createAnimationChannel()
        .setTargetNode(node)
        .setTargetPath(channel.getTargetPath())
        .setSampler(copied),
    );
    channels++;
  }
  return channels;
}

/** Moves a clip's hips (the root of a Mixamo skeleton) by `[x, y, z]` metres throughout. */
function shiftHips(document, clip, [x, y, z]) {
  const animation = document
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === clip);
  for (const channel of animation?.listChannels() ?? []) {
    if (!/Hips$/.test(channel.getTargetNode()?.getName() ?? '')) continue;
    if (channel.getTargetPath() !== 'translation') continue;
    const output = channel.getSampler().getOutput();
    const values = output.getArray().slice();
    for (let i = 0; i < values.length; i += 3) {
      values[i] += x;
      values[i + 1] += y;
      values[i + 2] += z;
    }
    output.setArray(values);
  }
}

async function readJson(file) {
  if (!existsSync(file)) return null;
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(file, 'utf8'));
}

async function buildCharacter(dir) {
  const name = basename(dir);
  const sourceDir = join(dir, 'source');
  const files = readdirSync(sourceDir).filter((f) => extname(f).toLowerCase() === '.fbx');
  const main = files.find((f) => basename(f, extname(f)).toLowerCase() === name.toLowerCase());
  if (!main) throw new Error(`${name}: no ${name}.fbx (the character, with skin) in source/`);
  const document = await load(join(sourceDir, main));
  // The character file's own (empty) takes: only the clips are kept.
  for (const animation of document.getRoot().listAnimations()) animation.dispose();
  for (const material of document.getRoot().listMaterials()) {
    // FBX2glTF carries Mixamo's FBX factors over: colour at 80% (a dull character) and, on
    // the hair, opacity 0, which multiplied the hair texture's alpha away (a bald Megan).
    // The textures hold the colour and the alpha.
    if (material.getBaseColorTexture()) material.setBaseColorFactor([1, 1, 1, 1]);
    // Hair cards: cut out (not blended, so they draw in order with everything else), low
    // enough to keep the fine strands, and seen from both sides.
    if (material.getAlphaMode() === 'BLEND') {
      material.setAlphaMode('MASK').setAlphaCutoff(0.25).setDoubleSided(true);
    }
    // No metal/roughness map (the hair): FBX2glTF's factors made it 40% metal and glossy.
    if (!material.getMetallicRoughnessTexture()) {
      material.setMetallicFactor(0).setRoughnessFactor(0.75);
    }
  }
  const settings = await readJson(join(dir, 'character.json'));
  const clips = [];
  for (const file of files.filter((f) => f !== main)) {
    const id = clipName(file);
    const channels = addClip(document, await load(join(sourceDir, file)), id);
    const shift = settings?.shift?.[id];
    if (shift) shiftHips(document, id, shift);
    clips.push(`${id} (${channels} channels${shift ? `, shifted ${shift.join(' ')}` : ''})`);
  }
  await compressTextures(document, 1024);
  await document.transform(resample(), dedup(), prune());
  const out = join(dir, 'character.glb');
  await io.write(out, document);
  console.log(`${name}: ${clips.join(', ')} → ${out}`);
}

async function buildProp(dir) {
  const name = basename(dir);
  const sourceDir = join(dir, 'source');
  const file = readdirSync(sourceDir).find((f) => /\.(glb|gltf|fbx)$/i.test(f));
  if (!file) throw new Error(`${name}: no .glb, .gltf or .fbx in source/`);
  const document = await load(join(sourceDir, file));
  for (const material of document.getRoot().listMaterials()) {
    if (material.getAlphaMode() === 'BLEND') material.setAlphaMode('OPAQUE');
  }
  // In metres, standing on the floor, centred: one wrapper node scales and moves the model.
  // Props are measured by their height in `props/<name>/prop.json` when set, else 1 m tall.
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  const { min, max } = getBounds(scene);
  const height = max[1] - min[1];
  const settings = await readJson(join(dir, 'prop.json'));
  const metres = settings?.height ?? 1;
  const scale = metres / height;
  // Turned (degrees about the vertical) so its front faces +Z, as the scene expects.
  const turn = ((settings?.rotation ?? 0) * Math.PI) / 180;
  const centre = [
    (-(min[0] + max[0]) / 2) * scale,
    -min[1] * scale,
    (-(min[2] + max[2]) / 2) * scale,
  ];
  const [cx, cy, cz] = centre;
  const wrapper = document
    .createNode('prop')
    .setScale([scale, scale, scale])
    .setRotation([0, Math.sin(turn / 2), 0, Math.cos(turn / 2)])
    .setTranslation([
      cx * Math.cos(turn) + cz * Math.sin(turn),
      cy,
      -cx * Math.sin(turn) + cz * Math.cos(turn),
    ]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
  await compressTextures(document, 1024);
  await document.transform(dedup(), prune());
  const out = join(dir, 'model.glb');
  await io.write(out, document);
  console.log(`${name}: ${metres} m tall (scaled ${scale.toFixed(4)}) → ${out}`);
}

try {
  for (const [folder, build] of [
    ['characters', buildCharacter],
    ['props', buildProp],
  ]) {
    const base = join(ROOT, folder);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(base, entry.name, 'source'))) {
        await build(join(base, entry.name));
      }
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
