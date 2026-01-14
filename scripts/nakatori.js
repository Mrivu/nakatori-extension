// Constants
const MOD = "nakatori-extension";
const SAN_INPUT_NAME = "system.attribs.san.value";
const SAN_VALUE_PATH = "system.attribs.san.value"; 
const SAN_MAX_PATH   = "system.attribs.san.max";
const HP_MAX_PATH    = "system.attribs.hp.max";

// Setup hooks
Hooks.once("init", () => console.log("Nakatori | init"));
Hooks.once("ready", () => console.log("Nakatori | ready"));



// Set flags
Hooks.once("ready", async () => {
  for (const actor of game.actors.contents) {

    // (Later you'll restrict this to PCs only)
    const hasCurse = actor.getFlag(MOD, "curse.value");

    if (hasCurse === undefined) {
      await actor.setFlag(MOD, "curse.value", 0);
    }

    const hasRadiance = actor.getFlag(MOD, "radiance.value");

    if (hasRadiance === undefined) {
      await actor.setFlag(MOD, "radiance.value", true);
    }
    
    // Init HP auto calc off
    const hpAuto = foundry.utils.getProperty(actor, "system.attribs.hp.auto");
    if (hpAuto === false) continue;
    await actor.update({
      "system.attribs.hp.auto": false
    }, { nakatoriSync: true });
  }
});

// Curse gain utility
async function gainCurse(actor, amount) {
  const cur = actor.getFlag(MOD, "curse.value") ?? 0;
  const daily = actor.getFlag(MOD, "dailycurse") ?? 0;

  await actor.update({
    [`flags.${MOD}.curse.value`]: cur + amount,
    [`flags.${MOD}.dailycurse`]: daily + Math.max(0, amount),
  }, { nakatoriInternal: true });
}

// Freeze Sanity
Hooks.on("preUpdateActor", (actor, updateData, options) => {
  if (options?.nakatoriSync) return;

  const attempted = foundry.utils.getProperty(updateData, SAN_VALUE_PATH);
  if (attempted !== undefined) {
    foundry.utils.setProperty(updateData, SAN_VALUE_PATH, 99);
  }

  const attemptedMax = foundry.utils.getProperty(updateData, SAN_MAX_PATH);
  if (attemptedMax !== undefined) {
    foundry.utils.setProperty(updateData, SAN_MAX_PATH, 99);
  }
});

// Show Curse instaed of Sanity
function replaceTextNode(node) {
  node.nodeValue = node.nodeValue
    .replace(/\bSanity\b/g, "Curse")
    .replace(/\bSAN\b/g, "CRS");
}
Hooks.on("renderActorSheet", (app, html) => {
  html.find("*").contents().filter(function () {
    return this.nodeType === Node.TEXT_NODE;
  }).each(function () { replaceTextNode(this); });
});
Hooks.on("renderChatMessage", (msg, html) => {
  html.find("*").contents().filter(function () {
    return this.nodeType === Node.TEXT_NODE;
  }).each(function () { replaceTextNode(this); });
});


// Edit Curse in the SAN field
Hooks.on("renderActorSheet", (app, html) => {
  const actor = app.actor;
  if (!actor) return;

  const $sanInput = html.find(`input[name="${SAN_INPUT_NAME}"]`);
  if (!$sanInput.length) return;

  $sanInput.attr("data-nakatori-sanity-name", SAN_INPUT_NAME);
  $sanInput.removeAttr("name");

  const curse = actor.getFlag(MOD, "curse.value") ?? 0;
  $sanInput.val(curse);

  $sanInput.off(".nakatori");
  $sanInput.on("change.nakatori", async (ev) => {
    const newCurse = Number(ev.currentTarget.value);
    const curCurse = actor.getFlag(MOD, "curse.value") ?? 0;
    await gainCurse(actor, newCurse - curCurse);
    $sanInput.val(actor.getFlag(MOD, "curse.value") ?? 0);
    });
});


// Roll with Curse instead of Sanity
Hooks.on("init", () => {
  const oldGetRollData = Actor.prototype.getRollData;

  Actor.prototype.getRollData = function () {
    const data = oldGetRollData.call(this);

    const curse = this.getFlag(MOD, "curse.value") ?? 0;
    const sanTarget = curse;

    if (data?.attribs?.san) data.attribs.san.value = sanTarget;
    if (data?.system?.attribs?.san) data.system.attribs.san.value = sanTarget;

    return data;
  };
});


// SAN loss -> Curse gain
Hooks.on("renderActorSheet", (app, html) => {
  const actor = app.actor;

  if (!actor) return;

  const $group = html.find(".derived-attribute.derived-attribute-dailysan-group");
  if (!$group.length) return;

  const DAILY_MAX = actor.getFlag(MOD, "dailycurseMAX") ?? NaN;

  $group.find(".derived-attribute-label").text("Daily CRS gain:");

  const dailyCurse = actor.getFlag(MOD, "dailycurse") ?? 0;

  const $vals = $group.find(".derived-attribute-value.derived-attribute-dailysan");
  if ($vals.length >= 1) $vals.eq(0).text(String(dailyCurse));
  if ($vals.length >= 2) $vals.eq(1).text(String(DAILY_MAX));

  const $reset = $group.find('a.reset-counter[data-counter="system.attribs.san.dailyLoss"]');
  if (!$reset.length) return;

  $reset.off(".nakatori");
  $reset.on("click.nakatori", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();

    await actor.setFlag(MOD, "dailycurse", 0);
    await actor.setFlag(MOD, "dailycurseMAX", Math.floor(20 - (actor.getFlag(MOD, "curse.value") / 8)));

    app.render(false);
  });
});



// Edit HP Formula
Hooks.on("preUpdateActor", (actor, updateData, options) => {
  if (options?.nakatoriSync) return;

  const con =
    foundry.utils.getProperty(updateData, "system.characteristics.con.value") ??
    foundry.utils.getProperty(actor, "system.characteristics.con.value");

  const siz =
    foundry.utils.getProperty(updateData, "system.characteristics.siz.value") ??
    foundry.utils.getProperty(actor, "system.characteristics.siz.value");

  console.log(`Nakatori | Setting HP max to ${con*2 + siz} (CON: ${con}, SIZ: ${siz})`);

  foundry.utils.setProperty(updateData, HP_MAX_PATH, Math.floor((con*2 + siz) / 10));
  
});


// Prowess tracking
function getProwess(actor) {
  const max = actor.getFlag(MOD, "prowess.max") ?? 0;
  const used = actor.getFlag(MOD, "prowess.used") ?? [];
  return { max: Number(max) || 0, used: Array.isArray(used) ? used : [] };
}

async function setProwess(actor, { max, used }) {
  await actor.update({
    [`flags.${MOD}.prowess.max`]: Math.min(10, max),
    [`flags.${MOD}.prowess.used`]: used
  }, { nakatoriInternal: true });
}

function normalizeUsedArray(max, used) {
  const arr = used.slice(0, max);
  while (arr.length < max) arr.push(false);
  return arr;
}

Hooks.on("renderActorSheet", (app, html) => {
  const actor = app.actor;
  if (!actor) return;

  if (html.find(".nakatori-prowess").length) return;

  const $resourceRow =
    html.find(".attribute-row, .derived-attributes, .attributes, .resource-row").first();

  const $insertBefore = $resourceRow.length ? $resourceRow : html.find("form").first();

  let { max, used } = getProwess(actor);
  used = normalizeUsedArray(max, used);

  const $prowess = $(`
    <section class="nakatori-prowess" style="margin: 0.4rem 0;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span style="font-weight:700;">PRW</span>
          <div class="nakatori-prowess-nodes" style="display:flex; gap:0.25rem; flex-wrap:wrap;"></div>
        </div>
        <div style="display:flex; gap:0.05rem;">
          <button type="button" class="nakatori-prowess-minus" title="Decrease nodes">−</button>
          <button type="button" class="nakatori-prowess-plus" title="Increase nodes">+</button>
        </div>
      </div>
    </section>
  `);

  $insertBefore.before($prowess);

  const $nodes = $prowess.find(".nakatori-prowess-nodes");

  function renderNodes() {
    $nodes.empty();
    for (let i = 0; i < max; i++) {
      const isUsed = !!used[i];

      const $node = $(`<button type="button" class="nakatori-prowess-node" data-idx="${i}"
        title="Toggle node"
        style="
          width: 14px; height: 14px; border-radius: 5px !important;
          border: 1px solid rgba(0,0,0,0.35);
          ${isUsed ? "opacity:1.00;" : "opacity:0.30; background-color:rgba(226, 244, 33, 0.15);"}
        ">
      </button>`);

      $nodes.append($node);
    }
  }

  renderNodes();

  $prowess.off(".nakatoriProwess");
  $prowess.on("click.nakatoriProwess", ".nakatori-prowess-node", async (ev) => {
    const idx = Number(ev.currentTarget.dataset.idx);
    if (!Number.isFinite(idx)) return;

    used = normalizeUsedArray(max, used);

    const toggled = !used[idx];

    for (let i = 0; i < max; i++) {
      if (i < idx) used[i] = true;
      else if (i > idx) used[i] = false;
      else used[i] = toggled;
    }

    await setProwess(actor, { max, used });
    renderNodes();
  });

  $prowess.on("click.nakatoriProwess", ".nakatori-prowess-plus", async () => {
    max = Math.min(10, Math.max(0, max + 1));
    used = normalizeUsedArray(max, used);
    await setProwess(actor, { max, used });
    renderNodes();
  });

  $prowess.on("click.nakatoriProwess", ".nakatori-prowess-minus", async () => {
    max = Math.min(10, Math.max(0, max - 1));
    used = normalizeUsedArray(max, used);
    await setProwess(actor, { max, used });
    renderNodes();
  });
});

// Remove Residence and Birthplace
Hooks.on("renderActorSheet", (app, html) => {
  html.find('input[name="system.infos.residence"]').closest(".detail-wrapper").remove();
  html.find('input[name="system.infos.birthplace"]').closest(".detail-wrapper").remove();
});

// Add Radiance
Hooks.on("renderActorSheet", (app, html) => {
  const actor = app.actor;
  if (!actor) return;

  if (html.find(".nakatori-radiance").length) return;

  const $portrait = html.find(".derived-attributes-bottom-line").first();

  const $anchor = $portrait;
  if (!$anchor.length) return;

  const radianceStatus = actor.getFlag(MOD, "radiance.value") ?
    "modules/nakatori-extension/images/RadianceToken.png" :
    "modules/nakatori-extension/images/NoRadianceToken.png";
  const $radiance = $(`
  <section class="nakatori-radiance"
    style="
      margin: 0.35rem 0;
      display: inline-flex;
      flex-direction: column;
      gap: 0.2rem;
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      width: fit-content;
      max-width: 100%;
    ">
    <div class="nakatori-radiance-header"
      style="
        display:flex;
        align-items:center;
        gap:0.5rem;
        background: transparent !important;
        border: none !important;
      ">
      <span style="font-weight:700;">RADIANCE</span>
      <div class="nakatori-radiance-nodes"
        style="display:flex; gap:0.25rem; flex-wrap:wrap; direction:ltr;">
      </div>
    </div>

    <button type="button" class="nakatori-radiance-image"
      title="Radiance"
      style="
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
        align-self: flex-start;
        cursor: pointer;
      ">
      <img
        src="${radianceStatus}"
        style="
          width: 55px;
          height: auto;
          display: block;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        "
      />
    </button>
  </section>
  `);
  $anchor.after($radiance);
  $radiance.find(".nakatori-radiance-image")
  .off("click.nakatori")
  .on("click.nakatori", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    const actorRadiance = actor.getFlag(MOD, "radiance.value") ?? false;
    await actor.setFlag(MOD, "radiance.value", !actorRadiance);
    app.render(false);
  });
});