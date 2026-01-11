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