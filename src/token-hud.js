import { ID, configFor, sourceActor, resolvePortrait, defaultPortraitForActor, normalize } from "./pairing.js";
import { canConfigureActor } from "./settings.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const galleries = new Map();
let synchronize = async () => {};
const concrete = path => typeof path === "string" && path.length > 0 && !path.includes("*");
export const isVideo = path => /\.(?:webm|mp4|ogg|m4v)(?:[?#].*)?$/i.test(path);

/** Combine Foundry's token wildcard list with the actor's configured pairing paths. */
export async function tokenImages(token) {
  const actor = sourceActor(token);
  if (!actor) return [];
  const config = configFor(actor);
  let wildcard = [];
  if (actor.prototypeToken?.randomImg) {
    try { wildcard = await actor.getTokenImages(); }
    catch (error) { console.warn(ID, "Unable to list Foundry wildcard images", error); }
  }
  return [...new Set([
    ...(wildcard ?? []), ...(config.tokens ?? []),
    ...(config.mappings ?? []).map(row => row.token),
    actor.prototypeToken?.texture?.src, token._source?.texture?.src ?? token.texture?.src
  ].filter(concrete))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function randomAlternative(images, current, random = Math.random) {
  const choices = images.filter(path => normalize(path) !== normalize(current));
  return choices.length ? choices[Math.floor(random() * choices.length)] : null;
}

export async function selectImage(token, image, images) {
  if (!token.isOwner) throw new Error("You do not have permission to change this token.");
  if (!configFor(sourceActor(token)).enabled) throw new Error("Portrait pairings are disabled for this actor.");
  if (!concrete(image) || !images.includes(image)) throw new Error("Choose an available token image.");
  // Use a standard document update so other modules and Foundry receive the change.
  await token.update({ "texture.src": image });
  await synchronize(token);
}

export class TokenImageGallery extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["shifting-faces-config", "shifting-faces-gallery"],
    position: { width: 820, height: 700 },
    window: { title: "Choose token image", icon: "fas fa-images", resizable: true },
    actions: { select: TokenImageGallery.select, random: TokenImageGallery.random, preview: TokenImageGallery.preview, configure: TokenImageGallery.configure }
  };
  static PARTS = { main: { template: "modules/shifting-faces/templates/gallery.hbs", scrollable: [".config-scroll"] } };

  constructor(token) {
    super();
    this.token = token;
    this.images = [];
    this.query = "";
    this.busy = false;
  }

  async _prepareContext() {
    const actor = sourceActor(this.token);
    const config = configFor(actor);
    this.images = config.enabled ? await tokenImages(this.token) : [];
    const current = this.token._source?.texture?.src ?? this.token.texture?.src;
    const previousName = this.token.getFlag?.(ID, "tokenName");
    const originalName = previousName && this.token.name === previousName.applied ? previousName.original
      : config.pairs.some(pair => pair.name?.trim() && pair.name.trim() === this.token.name)
        ? actor.prototypeToken?.name || actor.name || this.token.name : this.token.name;
    return {
      canConfigure: canConfigureActor(actor),
      tokenName: this.token.name, query: this.query,
      choices: this.images.map((src, index) => {
        const portrait = resolvePortrait(config, src, defaultPortraitForActor(actor));
        const tokenName = this.token.actorLink ? this.token.name
          : config.pairs.find(pair => normalize(pair.token) === normalize(src))?.name?.trim() || originalName;
        return { index, src, name: normalize(src).split("/").pop(), tokenName, portrait,
          video: isVideo(src), portraitVideo: isVideo(portrait),
          selected: normalize(src) === normalize(current) };
      })
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector(".gallery-search").addEventListener("input", event => {
      this.query = event.target.value;
      this.filter();
    });
    this.filter();
  }

  filter() {
    const query = this.query.trim().toLocaleLowerCase();
    let visible = 0;
    this.element.querySelectorAll("[data-image-choice]").forEach(card => {
      card.hidden = !`${card.dataset.name} ${card.dataset.tokenName ?? ""}`.toLocaleLowerCase().includes(query);
      if (!card.hidden) visible++;
    });
    const empty = this.element.querySelector(".gallery-no-results");
    if (empty) empty.hidden = visible !== 0;
  }

  _onClose(options) {
    super._onClose(options);
    if (galleries.get(this.token.uuid) === this) galleries.delete(this.token.uuid);
  }

  async choose(image, { close = false } = {}) {
    if (this.busy || !image) return;
    this.busy = true;
    this.element?.querySelectorAll('[data-action="select"],[data-action="random"]').forEach(button => { button.disabled = true; });
    try {
      await selectImage(this.token, image, this.images);
      if (close) await this.close();
      else await this.render(true);
    } catch (error) {
      console.error(ID, error);
      ui.notifications.error(error.message);
    } finally {
      this.busy = false;
      this.element?.querySelectorAll('[data-action="select"],[data-action="random"]').forEach(button => { button.disabled = button.dataset.action === "select" && !!button.closest(".selected"); });
    }
  }

  static select(event, button) { return this.choose(this.images[Number(button.dataset.index)], { close: true }); }
  static random() {
    const current = this.token._source?.texture?.src ?? this.token.texture?.src;
    return this.choose(randomAlternative(this.images, current), { close: true });
  }
  static preview(event, button) {
    const src = button.dataset.src;
    if (!src) return;
    new foundry.applications.apps.ImagePopout({ src, window: { title: this.token.name } }).render(true);
  }
  static configure() { game.modules.get(ID).api.open(sourceActor(this.token)); }
}

export function openGallery(token) {
  if (!token?.isOwner || !token.actor || !configFor(sourceActor(token)).enabled) return;
  let gallery = galleries.get(token.uuid);
  if (!gallery) {
    gallery = new TokenImageGallery(token);
    galleries.set(token.uuid, gallery);
  }
  return gallery.render(true);
}

export function registerTokenHUD(sync) {
  synchronize = sync;
  Hooks.on("renderTokenHUD", async (hud, html) => {
    const token = hud.object?.document;
    if (!token?.isOwner || !token.actor) return;
    const root = html?.querySelector ? html : html?.[0];
    const column = root?.querySelector(".col.right, .right");
    if (!configFor(sourceActor(token)).enabled) {
      column?.querySelector("[data-shifting-faces-switch]")?.remove();
      return;
    }
    if (!column || column.querySelector('[data-shifting-faces-switch]')) return;
    const images = await tokenImages(token);
    if (hud.object?.document !== token || !root.isConnected || !token.isOwner || !configFor(sourceActor(token)).enabled || images.length < 2) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-icon shifting-faces-switch";
    button.dataset.shiftingFacesSwitch = "";
    button.title = "Choose token image (right-click: random image)";
    button.setAttribute("aria-label", "Choose token image");
    const icon = document.createElement("i");
    icon.className = "fas fa-user-circle";
    button.appendChild(icon);
    button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      void openGallery(token);
    });
    button.addEventListener("contextmenu", async event => {
      event.preventDefault(); event.stopPropagation();
      try {
        const available = await tokenImages(token);
        const current = token._source?.texture?.src ?? token.texture?.src;
        const image = randomAlternative(available, current);
        if (image) await selectImage(token, image, available);
      } catch (error) { ui.notifications.error(error.message); }
    });
    column.appendChild(button);
  });
  Hooks.on("updateToken", (token, changes) => {
    if (foundry.utils.hasProperty(changes, "texture.src")) {
      const gallery = galleries.get(token.uuid);
      if (gallery && !gallery.busy) void gallery.render(true);
    }
  });
  Hooks.on("updateActor", (actor, changes) => {
    if (actor.isToken || !foundry.utils.hasProperty(changes, "flags." + ID)) return;
    if (!configFor(actor).enabled) {
      for (const gallery of galleries.values()) if (gallery.token.actorId === actor.id) void gallery.close();
    }
    const hud = globalThis.canvas?.hud?.token;
    if (hud?.object?.document?.actorId === actor.id) void hud.render(true);
  });
  Hooks.on("deleteToken", token => { void galleries.get(token.uuid)?.close(); });
}
