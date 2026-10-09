# Shifting Faces

Pair token images with actor portraits and switch between them from the token HUD.

**Requires Foundry VTT v14.**

## Features

- Discover token and portrait images using wildcard paths.
- Match images automatically by their trailing numeric index.
- Assign a specific portrait or the default actor portrait to any token image.
- Browse token images and their paired portraits in a searchable gallery.
- Switch images manually or randomly from the token HUD.
- Update portraits for both linked and unlinked tokens.

## Configuration access

By default, only the gamemaster can open the pairing configuration. To allow players to configure actors they own, enable **Settings → Configure Settings → Shifting Faces → Allow player configuration**. Players also need Foundry's **Use File Browser** and **Upload Files** user permissions.

The token HUD and switching macros are available to token owners regardless of this setting.

## Set up an actor

1. Enable **Shifting Faces** and reload Foundry.
2. Open an actor sheet and choose **Shifting Faces** from the header menu.
3. Check **Enable pairings**.
4. Enter the **Token images** and **Portrait images** wildcard paths.
5. Click **Discover images**.
6. Choose a portrait selection mode for each token image.
7. Click **Save and apply**.

Paths use Foundry's **User Data** storage. For example:

| Artwork | Wildcard path |
| --- | --- |
| Tokens | `art/tokens/warrior*.webp` |
| Portraits | `art/portraits/warrior-portrait*.jpg` |

Refresh discovery after adding new files. To randomize images when placing tokens, configure the wildcard path and randomization option separately in **Prototype Token**.

## Choose how portraits match

Each pairing has three selection modes:

- **Automatic index match** — matches the trailing number before the file extension.
- **Specific portrait** — shows a path field and file picker for an explicit portrait.
- **Default actor portrait** — uses the actor's original portrait.

For example, `warrior001.webp` matches `warrior-portrait001.jpg`. Prefixes and leading zeros are ignored, so `warrior001.webp` also matches `portrait1.png`.

Automatic matching requires exactly one portrait with the same index. Missing indices, filenames without a trailing number, and duplicate matches use the default actor portrait. Specific and default selections override automatic matching.

Click a token or portrait preview to open it at full size.

## Switch a token image

Open the token HUD and click the **portrait-in-a-circle** button. It appears when you own the token, pairings are enabled, and at least two images are available.

The gallery shows available token images with their paired portraits and marks the current image.

- Filter images by filename using the search field.
- Click **Use this image** to switch and close the gallery.
- Click **Random image** to select a different image and close the gallery.
- Right-click the HUD button for a quick random switch.
- Click a preview to view it at full size.
- Click **Pairings** to open the actor's pairing configuration when you have configuration access.

The gallery includes Foundry's token wildcard images and token paths saved in the actor's pairing configuration. Image and video artwork are supported.

## Linked and unlinked portraits

**Unlinked tokens** have individual actor portraits. Changing a token image updates only that token's portrait.

**Linked tokens** share one actor portrait. Changing any linked token's image updates that shared portrait for all linked tokens. The last changed token determines the portrait.

Saving applies pairings to existing tokens. For linked tokens, a controlled token takes priority; otherwise the current shared portrait is retained when it still matches an available token.

## Disable pairings

Uncheck **Enable pairings** and click **Save and apply**. This removes the HUD button, closes the gallery, and stops automatic portrait changes.

Portraits previously applied by the module are restored to their originals. Later manual portrait edits are preserved. Disable pairings and save before uninstalling if you want those original portraits restored.
## Use pairings in macros or item actions

Each pairing card displays a **Pair ID** with a copy button. Save the configuration before using a new ID. IDs stay the same when a pairing's portrait, mode, or token path is edited.

Create a macro with type **Script**, paste an example below, and replace `PAIR_ID` with the copied ID. For a specific token, replace `Scene.SCENE_ID.Token.TOKEN_ID` with its UUID as well:

```js
const api = game.modules.get("shifting-faces").api;
await api.switchPair("Scene.SCENE_ID.Token.TOKEN_ID", "PAIR_ID");
```

To switch the selected token:

```js
const token = canvas.tokens.controlled[0];
if (!token) return ui.notifications.warn("Select a token first.");
await game.modules.get("shifting-faces").api.switchPair(token, "PAIR_ID");
```

An item action that provides an `item` variable can pass its actor:

```js
await game.modules.get("shifting-faces").api.switchPair(item.actor, "PAIR_ID");
```

For an actor, the API uses its single controlled token, or its only token on the current scene. If the actor has multiple possible tokens or no token, pass a specific token UUID instead. Item-action macro variables depend on the system or action executing the script.

List an actor's saved pairings:

```js
const api = game.modules.get("shifting-faces").api;
console.table(await api.getPairs("Actor.ACTOR_ID"));
```

`getPairs(target)` returns each pairing's `id`, `token` image path, resolved `portrait`, and `mode`. Both methods accept Actor/Token UUIDs, Actor documents, TokenDocuments, or canvas Tokens.

`switchPair(target, pairId)` updates the token image and runs normal portrait synchronization. It requires enabled pairings and token ownership, and rejects unknown IDs or ambiguous actor targets. Linked tokens retain the shared-portrait behavior described above.