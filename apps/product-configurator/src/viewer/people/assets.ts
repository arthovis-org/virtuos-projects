/**
 * Characters and props, found by folder: characters/<Name>/character.glb and
 * props/<name>/model.glb, built from their source files by `npm run build:characters`.
 */
const characters = import.meta.glob<string>('/characters/*/character.glb', {
  query: '?url',
  import: 'default',
  eager: true,
});
const props = import.meta.glob<string>('/props/*/model.glb', {
  query: '?url',
  import: 'default',
  eager: true,
});

/** "/characters/Megan/character.glb" → "Megan". */
const byFolder = (files: Record<string, string>) =>
  new Map(Object.entries(files).map(([path, url]) => [path.split('/')[2] ?? '', url]));

const characterUrls = byFolder(characters);
const propUrls = byFolder(props);

export const characterUrl = (name: string) => characterUrls.get(name);
export const propUrl = (name: string) => propUrls.get(name);
