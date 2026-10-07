# Characters

People working at the desks: one folder per character, named after it.

```
characters/<Name>/
  source/              Mixamo downloads (not committed)
    <Name>.fbx         the character: FBX Binary, With Skin, T-pose
    <Clip Name>.fbx    each animation: FBX Binary, Without Skin, 30 fps, same character
  character.json       optional: `shift`, metres to move a clip's hips by (see below)
  character.glb        built by `npm run build:characters`: mesh, skeleton and every clip
```

Clips are named after their files: "Sit To Stand.fbx" becomes `sitToStand`. A desk's occupant
(product.json `occupant`) uses `typing` (else `sittingIdle`) while seated, `standingIdle` while
standing, and `sitToStand` / `standToSit` between them (src/viewer/people/Occupant.tsx).

Every clip must measure from the same spot, the seat. Mixamo's standing clips start where its
Sit To Stand ends, a step in front of the chair, so `shift` moves them back onto it:
`{ "shift": { "standingIdle": [0, 0, 0.465], "standToSit": [0, 0, 0.465] } }`.

Props such as chairs live in `props/<name>/` the same way: `source/` holds the download (.glb,
.gltf or .fbx), `prop.json` its `height` in metres and `rotation` in degrees, and the build
writes `model.glb` in metres, on the floor, facing +Z. Credit authors in a `CREDITS.md` there.
