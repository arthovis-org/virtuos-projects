/**
 * Minimal glTF reading: only the JSON part of a .glb / .gltf, which holds every node,
 * mesh and material name. Geometry and textures are never touched, so models are used
 * exactly as exported. Names are used as written in Blender; the viewer finds nodes by the
 * original name three.js keeps in `userData.name`, so its own renaming does not matter.
 */
import { readFile } from 'node:fs/promises';

export interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
}

export interface GltfJson {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives: { material?: number }[] }[];
  materials?: { name?: string }[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

export async function readGltfJson(path: string): Promise<GltfJson> {
  const data = await readFile(path);
  if (path.toLowerCase().endsWith('.gltf')) return JSON.parse(data.toString('utf8')) as GltfJson;

  if (data.length < 20 || data.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error('not a binary glTF (.glb) file');
  }
  const chunkLength = data.readUInt32LE(12);
  if (data.readUInt32LE(16) !== JSON_CHUNK) throw new Error('the .glb has no JSON chunk');
  return JSON.parse(data.subarray(20, 20 + chunkLength).toString('utf8')) as GltfJson;
}
