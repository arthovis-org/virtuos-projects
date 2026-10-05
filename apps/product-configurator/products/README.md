# Products

One folder per product. The folder name is the product id used in links
(`?product=smart-desk`): lowercase letters, digits and dashes.

```
products/
  smart-desk/
    model.glb          the Blender export, used exactly as exported (required)
    product.json       name, prices, defaults, height range (optional)
    images/            logos and other images laid on the model (optional)
    materials/         PBR finish texture sets (optional)
      DeskMat/
        walnut/        walnut_diff_2k.jpg, walnut_nor_gl_2k.jpg, walnut_arm_2k.jpg
```

Drop a folder in and the configurator picks it up; while `npm run dev` runs, saving any file in
here reloads the page. `npm run inspect -- smart-desk` shows what was recognised and what needs
fixing, and the same list appears in the app in development.

## Object names

Name objects in Blender with these prefixes. Everything else about the model is left alone.

| Name                                           | Becomes                                            |
| ---------------------------------------------- | -------------------------------------------------- |
| `Toggle_SideMonitors`                          | an on/off option "Side monitors"                   |
| `Toggle_SideMonitors_Left`, `…_Right`          | the same option; everything after the name is free |
| `Variant_Legs_Straight`, `Variant_Legs_TShape` | a pick-one option "Legs": Straight / T shape       |
| `Lift100_Top`                                  | moves 100 % with the height control                |
| `Lift50_Leg_L_Middle`                          | moves 50 % (middle stage of a three-stage leg)     |

- Tags combine, `Lift<n>` first: `Lift100_Toggle_DeskMonitor` rises with the desk and can be
  switched off.
- Children follow their parent. Parent the monitors to the top in Blender and only the top needs
  `Lift100`; an object inside a toggled object disappears with it.
- Labels come from the name (`SideMonitors` → "Side monitors"); `product.json` can override them.

### Three-stage legs

The top and everything on it rise by the full height change, the middle stage by half of it, and
the base stays on the floor:

```
Lift100_Top              (monitors, arm etc. parented to it, or tagged Lift100 themselves)
Lift100_Leg_L_Upper      Lift100_Leg_R_Upper
Lift50_Leg_L_Middle      Lift50_Leg_R_Middle
Leg_L_Base               Leg_R_Base
```

The current height is measured from the top surface of the `Lift` object named like "top" or
"desk" (or `height.reference`), so the model can be exported at any height.

## Materials

A folder under `materials/` named after a **Blender material** adds a finish option for every
mesh that uses that material. Each sub-folder is one choice, holding a PBR texture set:

```
materials/
  DeskMat/                         the Blender material's name
    walnut/                        one choice ("Walnut")
      walnut_diff_2k.jpg           colour (base colour / albedo)
      walnut_nor_gl_2k.jpg         normal map
      walnut_arm_2k.jpg            packed AO + roughness + metalness
      swatch.jpg                   optional small image for the swatch button
    white-oak/
      Wood049_2K_Color.jpg
      Wood049_2K_NormalGL.jpg
      Wood049_2K_Roughness.jpg
      Wood049_2K_AmbientOcclusion.jpg
```

Files keep the names the texture site gave them; the map type is read from the words in the
name:

| Map       | Recognised words                                                |
| --------- | --------------------------------------------------------------- |
| Colour    | `color`, `colour`, `basecolor`, `albedo`, `diff`, `diffuse`     |
| Normal    | `normal`, `nor`, `nrm`, `normalgl`; `dx` / `normaldx` = DirectX |
| Roughness | `roughness`, `rough`                                            |
| Metalness | `metalness`, `metallic`, `metal`                                |
| AO        | `ao`, `occlusion`, `ambientocclusion`                           |
| Packed    | `arm`, `orm` (R = AO, G = roughness, B = metalness)             |
| Swatch    | `swatch`, `thumb`, `preview`                                    |
| Ignored   | `displacement`, `height`, `bump`, `opacity`, `specular` …       |

- **Normal maps:** three.js expects OpenGL-style. DirectX ones (`_dx`, `NormalDX`) are flipped
  automatically; if one is not named so, set `"normalDirectX": true` for the choice.
- **Glossiness** maps are inverted roughness and are reported; download the roughness version.
- The first choice is "As modelled" (the material exactly as exported) unless `product.json`
  says otherwise.
- A single image works too: `materials/DeskMat/walnut.jpg` is a colour-only choice, and
  `walnut_normal.jpg` next to it adds a normal map.

Settings per choice go in `product.json` (`materials.<Material>.choices.<choice>`):

| Setting          | Default   | Use                                                        |
| ---------------- | --------- | ---------------------------------------------------------- |
| `repeat`         | `1`       | tile the textures `n` times across the UV map, or `[u, v]` |
| `rotation`       | `0`       | degrees, e.g. `90` to turn the wood grain                  |
| `normalScale`    | `1`       | strength of the normal map                                 |
| `roughness`      | map / 0.6 | multiplies the roughness map (1 = as the map says)         |
| `metalness`      | map / 0   | multiplies the metalness map                               |
| `color`          | white     | tint multiplied with the colour map                        |
| `label`, `price` |           | as for other options                                       |

### Preparing the model in Blender

The textures follow the mesh's **UV map**, so it decides how big the wood grain looks:

1. Select the desk top, Tab into Edit Mode, select all, then _UV > Cube Projection_ (or _Smart
   UV Project_). Box-like parts unwrap cleanly this way, edges included.
2. Make the scale consistent: with _UV > Average Islands Scale_ and _Pack Islands_ off, 1 UV unit
   then covers roughly the same area everywhere, so the grain is the same size on the top and
   on the edges.
3. For a tileable texture that covers about 1 m, set the UV scale so 1 UV unit ≈ 1 m (in the UV
   editor, scale until a 1 m square fills the 0–1 square), then tune with `repeat`.
4. Rotate the top's UV island so the grain runs along the desk's length, or use `rotation`.
5. Keep the material assigned to the top named exactly like its folder (`DeskMat`).

Previewing the texture set in Blender first (Principled BSDF, same images) is the quickest way
to judge scale; what you see there with 1 UV unit ≈ 1 m is what `repeat: 1` shows here.

### Keeping it light

- Use **1K or 2K** textures (1024–2048 px); 4K and 8K sets add megabytes and GPU memory for no
  visible gain on a desk top. JPG for colour, normal and roughness is fine.
- Only the selected choice's maps are downloaded, but every swatch button shows an image: add a
  small `swatch.jpg` (about 128 px) per choice, otherwise the full colour map is used.

## Screens and workspaces

A workspace puts **live websites on the product's monitors**, so visitors can feel what the extra
screens are for: they pick a workspace on the card over the viewer, the camera moves to
a seated view (looking down a little when a screen lies on the desk), and they can use the sites,
zoom to one screen (⤢), or drag a window by its title bar onto another one: dropped on the
window's edge the two share the screen side by side (stacked on a portrait screen), dropped on its
middle they swap screens. The line between two windows on one screen can be dragged to share the space differently (double click makes them equal). Windows can be closed (×); an empty screen offers to reopen them,
a few suggested sites that allow embedding, or any https address. "Look around" hands the camera
back while the sites stay on; "Close" turns them off.

**Screens** are found automatically: every object whose mesh uses the Blender material
**`Screen`** is one (the display surface, not the bezel). Nothing else is needed in Blender; the
size, the facing side and which edge is the top are worked out from the geometry, so portrait and
reclined screens work too. Screens follow the height control and disappear with their monitor's
toggle; windows on a switched-off screen move to the main screen until it's back.

**Workspaces** are listed in `product.json`, keyed by id:

```json
"screens": {
  "labels": { "MainMonitor": "Main", "MonitorLeft": "Left" }
},
"workspaces": {
  "office": {
    "label": "Office",
    "description": "Calendar, research, notes and a whiteboard.",
    "windows": [
      { "title": "Calendar", "url": "https://calendar.google.com/calendar/embed?src=…&mode=WEEK", "screen": "MainMonitor" },
      { "title": "Wikipedia", "url": "https://en.wikipedia.org/wiki/Multi-monitor", "screen": "MonitorLeft" }
    ]
  }
}
```

- `screen` is the monitor's object name from Blender; tags can be left out (`MonitorLeft` finds
  `Toggle_MonitorLeft`). Several windows on one screen sit side by side, or stacked on a portrait
  screen.
- `screens.labels` names the screens in the UI; `screens.material` changes the material name;
  `screens.pixelsPerMetre` (default 1200) sets how many CSS pixels fit in a metre of screen. It is
  the same on every screen, like a real desk, so a narrow portrait screen shows a site's narrow
  layout.
- `screens.tilt` (degrees, default 15) is how far the seated view looks down when a screen lies on
  the desk, so it can be read; `0` looks straight at the main screen. The seated camera follows
  the desk as its height changes, a little behind it so the movement can be seen.

**Workspace files.** Workspaces can also live in `workspaces/<id>.json`, one per file, which keeps
`product.json` short when there are many. They come after the `product.json` workspaces, by
`order` and then by name. The first workspace overall is the one the demo card offers first.

```json
{
  "label": "Crypto",
  "icon": "💰",
  "accent": "#f7931a",
  "order": 20,
  "description": "Bitcoin live, the crypto screener, market news and the coin heatmap.",
  "windows": [
    {
      "title": "BTC / USDT",
      "url": "https://s.tradingview.com/widgetembed/?symbol=BINANCE%3ABTCUSDT",
      "screen": "MainMonitor"
    }
  ]
}
```

- `icon` (an emoji or a short symbol) and `accent` (`#rrggbb`) mark the workspace in the desk
  switcher, on desk name tags and on the posters of unlimited desks mode. Both also work in
  `product.json`. Prefer emoji that older systems have: 🪙, for one, is missing on Windows 10.
- `{host}` in a `url` becomes the page's host name. Twitch embeds need it:
  `https://player.twitch.tv/?channel=monstercat&parent={host}`.

### Unlimited desks

With more than one workspace, the demo card and the header offer **Unlimited desks**: a room of
desks, side by side on arcs around one point so they all face it, each a copy of the model with its own workspace and its own configuration, to show what
having a desk for every kind of work is like. The room starts with the visitor's desk and the
`finance`, `crypto`, `nba` and `soccer` workspaces, where they exist (`STARTER_DESKS` in
`src/state/desksStore.ts`). Visitors add desks with any workspace, remove them, switch with the
switcher, the name tags or Ctrl + ← / →, and change a desk's workspace from the toolbar.

Only the desk the visitor is at runs live sites; the screens of the others show a poster of
their workspace, so the room stays light however many desks it has (up to `MAX_DESKS`, 36).
Desks are never priced. Each desk has its own height; the height control moves the desk the
visitor is at. The room is part of the link:
`?product=smart-desk&desks=finance,crypto~toggle-side-monitors:without&desk=2` lists each
desk's workspace and the options that differ from the defaults; `desk` is the one the visitor is
at, counted from 1.

### Which sites can be shown

Sites decide themselves whether other pages may show them. These work (checked when this was
written):

| Works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Doesn't (refuses to be embedded)                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Calendar **embed** links (Settings → Integrate calendar), Wikipedia, Wikivoyage, StackEdit, Excalidraw, tldraw, draw.io (`embed.diagrams.net`), YouTube **embed** links (`youtube-nocookie.com/embed/…`, also `videoseries?list=UU…` for a channel's latest uploads), Jitsi Meet, OpenStreetMap embed, Desmos, Photopea, Coolors, Spotify embed, Google Docs/Sheets/Slides **published to the web**, TradingView widgets (`s.tradingview.com/widgetembed/…`, `tradingview-widget.com/embed-widget/<widget>/#<settings>`), Twitch player and chat (with `parent={host}`), StackBlitz embeds of classic templates (`stackblitz.com/edit/typescript?embed=1`), DevDocs, Windy (`embed.windy.com`), ADS-B Exchange, NASA Eyes, Stellarium Web, wheretheiss.at | Gmail, Outlook, Notion, Office 365, BBC, Hacker News, CodePen, regex101, CoinGecko, mempool.space, Flightradar24, Liquipedia, most banking and social sites |

For a real spreadsheet, use Google Sheets → File → Share → **Publish to web** → _Embed_ and paste
the link. Some sites load but don't work inside another page: the Lo-fi Girl YouTube live stream
says "Video unavailable", and StackBlitz's Vite templates need more than an embed allows. A site that stays blank has refused; every window has an **Open in new tab** button
(↗) for that case. Only `https://` links are accepted.

## product.json

Everything is optional. Keys refer to names from Blender (case and underscores don't matter).

```json
{
  "name": "Smart Desk",
  "description": "Motorised sit-stand desk with an integrated three-monitor arm.",
  "currency": "USD",
  "basePrice": 899,
  "order": 1,

  "options": {
    "SideMonitors": { "label": "Side monitors", "price": 598 },
    "DeskMonitor": { "price": 349, "default": false },
    "Legs": { "default": "Straight", "choices": { "TShape": { "label": "T-frame", "price": 90 } } }
  },

  "materials": {
    "DeskMat": {
      "label": "Desk top",
      "default": "walnut",
      "original": false,
      "choices": {
        "walnut": { "price": 150, "repeat": 2, "rotation": 90 },
        "white": { "label": "White laminate", "color": "#f2f1ec", "roughness": 0.7 }
      }
    }
  },

  "height": {
    "label": "Desk height",
    "unit": "cm",
    "min": 65,
    "max": 125,
    "initial": 72,
    "presets": { "Sit": 72, "Stand": 110 }
  }
}
```

- `options.<Name>`: for a toggle, `price` is the price when on and `default` is `true`/`false`.
  For a variant, `default` names the initial choice and `choices` holds per-choice labels and
  prices. `includes` merges toggles into one option without renaming anything in Blender:
  `"SideMonitors": { "includes": ["MonitorLeft", "MonitorRight"], "price": 399 }`.
- `options.<Name>.parts`: for objects modelled in two versions on top of each other, e.g. a back
  plate with and without side monitor mounts:
  `"parts": { "on": ["MainBackplatewithSideMonitors"], "off": ["MainBackplate"] }`. `on`
  objects show only while the option is on, `off` objects only while it is off. Only the
  object's own geometry is swapped; objects parented to it stay (a desk top with a hinge can
  be swapped without hiding the monitors on it).
- `decals`: images laid on objects, such as a logo. The image lives in `images/` and is a mask:
  white shows in `color` (default light grey), black shows the object.
  `{ "image": "images/logo.png", "objects": ["MainBackplate"], "width": 0.3, "side": "back" }`
  centres it on that side of each object's own geometry (`front` faces the viewer; also
  `left`, `right`, `top`, `bottom`), `width` in metres; `offset: [right, up]` in metres moves
  it from the centre. It moves and hides with its object.
- `materials.<Material>.choices`: settings for image choices (price, label, roughness,
  metalness), or colour-only choices with `color`. `"original": false` hides "As modelled";
  a string renames it.
- `height`: `min` / `max` should stay within what the leg stages can do: at `max` each stage
  should still overlap the next, and at `min` none should go below the floor. Without
  `initial` the desk starts at the height it was exported at.
  `reference` names the desk-top object; its own top surface is the height (recommended when
  large parts such as monitor panels are parented to the top). Without it, the widest mesh
  under the `Lift100` objects is used. `modelled` sets the exported height instead of
  measuring it; `speed` is units per second.
- `currency`: the currency prices are written in (default USD). Visitors can view them in
  USD, EUR, COP, Bitcoin or Ether from the header; those are converted at the day's rate
  (from Coinbase's public rates, fetched in the browser), marked as converted in the price summary.
  Without live rates, EUR and COP use rough built-in rates and the crypto options are off.
- `order`: position in the product switcher; the lowest is the default product.
- `screens`, `workspaces`: see [Screens and workspaces](#screens-and-workspaces).

## Keeping models outside the repository

Set `CONFIGURATOR_PRODUCTS_DIR` to another folder with the same layout, for example to keep large
or private models out of git:

```bash
CONFIGURATOR_PRODUCTS_DIR=../my-products npm run dev
```
