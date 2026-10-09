import { ID, configFor, discover, resolvePortrait, normalize, defaultPortraitForActor, pairIdForPath } from "./pairing.js";
import { canConfigureActor } from "./settings.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShiftingFacesConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form", classes: ["shifting-faces-config"],
    position: { width: 920, height: 780 },
    window: { title: "Shifting Faces", icon: "fas fa-images", resizable: true },
    form: { handler: ShiftingFacesConfig.save, closeOnSubmit: false },
    actions: {
      discover: ShiftingFacesConfig.scan,
      pick: ShiftingFacesConfig.pick,
      add: ShiftingFacesConfig.add,
      remove: ShiftingFacesConfig.remove,
      preview: ShiftingFacesConfig.preview,
      copyPairId: ShiftingFacesConfig.copyPairId
    }
  };
  static PARTS = {
    main: { template: "modules/shifting-faces/templates/config.hbs", scrollable: [".config-scroll"] },
    footer: { template: "modules/shifting-faces/templates/footer.hbs" }
  };

  constructor(actor) {
    super();
    this.actor = actor;
    this.draft = foundry.utils.deepClone(configFor(actor));
    this.draft.tokenPattern ||= actor.prototypeToken.texture.src;
    this.tokens = this.draft.tokens ?? [];
    this.rows = this.draft.pairs.map(pair => {
      const mapping = this.draft.mappings.find(row => row.token === pair.token);
      return { id: pair.id, token: pair.token, name: pair.name ?? "", portrait: mapping?.portrait ?? "", mode: mapping ? mapping.portrait ? "explicit" : "default" : "auto" };
    });
  }

  render(...args) {
    if (!canConfigureActor(this.actor)) {
      ui.notifications.warn("You do not have permission to configure Shifting Faces for this actor.");
      return this;
    }
    return super.render(...args);
  }

  async _prepareContext() {
    return {
      id: this.id, actorName: this.actor.name, config: this.draft,
      portraitChoices: this.draft.portraits,
      rows: this.rows.map((row, index) => ({
        ...row, index, isSpecific: row.mode === "explicit",
        displayName: row.token ? normalize(row.token).split("/").pop() : "New pairing",
        preview: resolvePortrait({ ...this.draft, enabled: true, mappings: row.mode === "auto" ? [] : [{ token: row.token, portrait: row.mode === "default" ? "" : row.portrait }] }, row.token, defaultPortraitForActor(this.actor)),
        modes: { auto: "Automatic index match", explicit: "Specific portrait", default: "Default actor portrait" }
      }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.onchange = () => {
      this.capture();
      this.element.querySelectorAll("[data-pairing-row]").forEach((element, index) => {
        const row = this.rows[index];
        const mappings = row.mode === "auto" ? [] : [{ token: row.token, portrait: row.mode === "default" ? "" : row.portrait }];
        element.querySelector(".portrait-preview").src = resolvePortrait({ ...this.draft, enabled: true, mappings }, row.token, defaultPortraitForActor(this.actor));
        element.querySelector(".token-preview").src = row.token || "icons/svg/mystery-man.svg";
        element.querySelector(".specific-portrait").hidden = row.mode !== "explicit";
        const title = element.querySelector(".pairing-title");
        title.textContent = row.token ? normalize(row.token).split("/").pop() : "New pairing";
        title.title = row.token;
      });
    };
  }

  capture() {
    const form = this.element;
    for (const key of ["enabled"]) this.draft[key] = form.elements[key].checked;
    for (const key of ["tokenPattern", "portraitPattern"]) this.draft[key] = form.elements[key].value.trim();
    this.rows = [...form.querySelectorAll("[data-pairing-row]")].map(row => ({
      id: row.dataset.pairId,
      token: row.querySelector('[data-field="token"]').value.trim(),
      name: row.querySelector('[data-field="name"]').value.trim(),
      portrait: row.querySelector('[data-field="portrait"]').value.trim(),
      mode: row.querySelector('[data-field="mode"]').value
    }));
  }

  static async scan() {
    if (!canConfigureActor(this.actor)) return;
    this.capture();
    try {
      const [tokens, portraits] = await Promise.all([
        discover(this.draft.tokenPattern),
        discover(this.draft.portraitPattern)
      ]);
      this.tokens = tokens;
      this.draft.portraits = portraits;
      const existing = new Set(this.rows.map(row => row.token));
      for (const token of tokens) if (!existing.has(token)) this.rows.push({ id: pairIdForPath(token), token, name: "", portrait: "", mode: "auto" });
      await this.render(true);
      ui.notifications.info(`Found ${tokens.length} token images and ${portraits.length} portraits. Save to keep the pairings.`);
    } catch (error) {
      console.error(ID, error);
      ui.notifications.error(`Cannot discover images: ${error.message}`);
    }
  }

  static pick(event, button) {
    if (!canConfigureActor(this.actor)) return;
    const input = button.closest(".path-field").querySelector("input");
    new foundry.applications.apps.FilePicker.implementation({
      type: "imagevideo", activeSource: "data", current: input.value,
      callback: path => { input.value = path; input.dispatchEvent(new Event("change", { bubbles: true })); }
    }).render(true);
  }

  static preview(event, button) {
    const src = button.querySelector("img")?.getAttribute("src");
    if (!src) return;
    const Popout = foundry.applications.apps.ImagePopout;
    new Popout({ src, window: { title: this.actor.name + " — " + button.dataset.kind } }).render(true);
  }

  static async copyPairId(event, button) {
    const input = button.closest(".pairing-id").querySelector("input");
    try {
      await navigator.clipboard.writeText(input.value);
      ui.notifications.info("Pair ID copied. Save the pairing before using it in a macro");
    } catch {
      input.focus();
      input.select();
      ui.notifications.warn("Copy the selected Pair ID manually");
    }
  }

  static async add() {
    if (!canConfigureActor(this.actor)) return;
    this.capture();
    this.rows.push({ id: "pair-" + crypto.randomUUID(), token: "", name: "", portrait: "", mode: "explicit" });
    await this.render(true);
  }

  static async remove(event, button) {
    if (!canConfigureActor(this.actor)) return;
    this.capture();
    this.rows.splice(Number(button.closest("[data-pairing-row]").dataset.index), 1);
    await this.render(true);
  }

  static async save() {
    if (!canConfigureActor(this.actor)) return;
    this.capture();
    const mappings = [];
    const seen = new Set();
    for (const row of this.rows) {
      if (!row.token) continue;
      const key = row.token;
      if (seen.has(key)) return ui.notifications.warn("Each token image must appear only once.");
      seen.add(key);
      if (row.mode === "explicit" && (!row.portrait || row.portrait.includes("*"))) return ui.notifications.warn("Specific portraits must be concrete image paths. Choose Default for the actor portrait.");
      if (key.includes("*")) return ui.notifications.warn("Pairing rows need concrete token paths. Use Discover for wildcard patterns.");
      if (row.mode !== "auto") mappings.push({ token: key, portrait: row.mode === "default" ? "" : row.portrait });
    }
    this.draft.pairs = this.rows.filter(row => row.token).map(row => ({ id: row.id ?? pairIdForPath(row.token), token: row.token, name: row.name ?? "" }));
    this.draft.mappings = mappings;
    this.draft.tokens = this.rows.filter(row => row.token).map(row => row.token);
    try {
      await this.actor.setFlag(ID, "config", this.draft);
      const applied = await game.modules.get(ID).api.applyActor(this.actor);
      if (applied) {
        ui.notifications.info("Portrait pairings saved and applied.");
        await this.close();
      }
      else ui.notifications.warn("Pairings saved, but some portraits could not be updated. See the console for details.");
    } catch (error) {
      console.error(ID, error);
      ui.notifications.error(`Could not save pairings: ${error.message}`);
    }
  }
}
