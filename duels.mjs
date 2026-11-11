// Ref Pocket : joue tes duels récompensés du jour contre ton propre compte bot.
//
// Chaque duel en ligne rapporte des Kheys (victoire +30 K, défaite +10 K), dans la limite
// de 10 duels récompensés par jour (DUEL_WIN, DUEL_LOSS, DUEL_DAILY dans le site). Le
// script connecte tes deux comptes, les rend amis si besoin, puis enchaîne :
//   1. ton compte défie le bot avec ton meilleur deck ;
//   2. le bot accepte avec un deck composé en priorité de cartes que tu n'as pas
//      (le gagnant prend une carte du deck du perdant : autant qu'elle te serve) ;
//   3. --mode=abandon (par défaut) : le bot abandonne tout de suite, tu gagnes ;
//      --mode=jouer : les deux comptes jouent coup par coup, toi au mieux, le bot au plus
//      mal. Si le serveur ne récompense pas un duel abandonné, le script passe tout seul
//      en mode jouer pour les duels suivants ;
//   4. si tu gagnes, tu retournes une des 6 cartes du bot au hasard et tu la gardes.
//      Si le bot gagne (mode jouer), il ne prend rien : on ne réclame pas sa carte.
//
//   REF_EMAIL=... REF_PASS=... BOT_EMAIL=... BOT_PASS=... node duels.mjs
//   ... node duels.mjs --dry           -> vérifie les comptes, l'amitié et les decks, sans jouer
//   ... node duels.mjs --nombre=3      -> au plus 3 duels (par défaut : tous ceux qui restent)
//   ... node duels.mjs --mode=jouer    -> jouer les coups au lieu de faire abandonner le bot
//   npm run duels -- --dry     (lit le .env en local ; secrets sur GitHub Actions)
//
// Le compte bot doit avoir au moins 6 cartes différentes : ouvre ses boosters avec
// boosters.mjs (le workflow duels.yml le fait avant chaque série).
//
// Écrit un compte rendu dans duels.md.

import { writeFileSync } from "node:fs";
import { connecter as ouvrir, lireTout } from "./session.mjs";

const { REF_EMAIL, REF_PASS, BOT_EMAIL, BOT_PASS } = process.env;
if (!REF_EMAIL || !REF_PASS) throw new Error("REF_EMAIL / REF_PASS manquants");
if (!BOT_EMAIL || !BOT_PASS) throw new Error("BOT_EMAIL / BOT_PASS manquants (identifiants du compte bot)");
if (BOT_EMAIL.trim().toLowerCase() === REF_EMAIL.trim().toLowerCase()) throw new Error("BOT_EMAIL doit être un autre compte que REF_EMAIL");

const DRY = process.argv.includes("--dry");
const modeArg = process.argv.find((a) => a.startsWith("--mode="));
let MODE = modeArg ? modeArg.slice("--mode=".length) : "abandon";
if (!["abandon", "jouer"].includes(MODE)) throw new Error("--mode doit valoir abandon ou jouer");
const nombreArg = process.argv.find((a) => a.startsWith("--nombre="));
const NOMBRE = nombreArg ? Number(nombreArg.slice("--nombre=".length)) : Infinity;
if (nombreArg && (!Number.isInteger(NOMBRE) || NOMBRE < 1)) throw new Error("--nombre doit être un entier positif");

// Mêmes valeurs que le site (cartes.js / index.html).
const DUEL_DAILY = 10, DECK_SIZE = 6, DECK_MAX = { L: 1, E: 2 };
const RORDER = ["L", "E", "R", "C"];
const MAX_COUPS = 300; // garde-fou par duel en mode jouer

const die = (m) => { console.error(m); process.exit(1); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const todayUTC = () => new Date().toISOString().slice(0, 10);

async function connecter(email, pass, qui) {
  const { sb, me, error } = await ouvrir(email, pass);
  if (error) die(`${qui} : ${error}`);
  return { sb, me, qui };
}
const restants = (p) => Math.max(0, p.daily_day === todayUTC() ? DUEL_DAILY - p.daily_n : DUEL_DAILY);
const rafraichir = async (j) => { const p = await j.sb.rpc("my_profile"); if (!p.error && p.data) j.me = p.data; return j.me; };

const moi = await connecter(REF_EMAIL, REF_PASS, "ton compte");
const bot = await connecter(BOT_EMAIL, BOT_PASS, "compte bot");
console.log(`${moi.me.pseudo} contre ${bot.me.pseudo} (bot), mode ${MODE}.${DRY ? "  (DRY-RUN : aucun duel ne sera joué)" : ""}`);

const cards = Object.fromEntries((await lireTout(() => moi.sb.from("cards").select("id,name,n,rarity,p,d,v").order("id"))).map((c) => [c.id, c]));
const nomDe = (id) => cards[id]?.name || id;

// ---------- Amitié (nécessaire pour se défier) ----------
async function lienAmi() {
  const { data, error } = await moi.sb.from("friendships").select("*")
    .or(`and(requester.eq.${moi.me.id},addressee.eq.${bot.me.id}),and(requester.eq.${bot.me.id},addressee.eq.${moi.me.id})`);
  if (error) die("Amitié illisible : " + error.message);
  return data.find((f) => f.status === "accepted") || data.find((f) => f.status === "pending") || null;
}
{
  let f = await lienAmi();
  if (f?.status !== "accepted") {
    if (DRY) console.log(`Amitié : ${f ? "demande en attente" : "aucune"}, elle serait créée.`);
    else {
      if (!f) {
        const r = await moi.sb.rpc("friend_request", { p_pseudo: bot.me.pseudo });
        if (r.error) die("Demande d'ami impossible : " + r.error.message);
        f = await lienAmi();
      }
      if (f && f.status === "pending") {
        const destinataire = f.addressee === bot.me.id ? bot : moi;
        const r = await destinataire.sb.rpc("friend_respond", { p_id: f.id, p_accept: true });
        if (r.error) die("Acceptation de l'ami impossible : " + r.error.message);
      }
      if ((await lienAmi())?.status !== "accepted") die("Les deux comptes ne sont toujours pas amis.");
      console.log("Amitié : les deux comptes sont maintenant amis.");
    }
  }
}

// ---------- Decks ----------
// Cartes différentes disponibles (hors annonces et échanges), avec ou sans holo.
async function collection(j) {
  const parCarte = new Map();
  for (const i of await lireTout(() => j.sb.from("card_instances").select("id,card_id,holo,lock").eq("owner", j.me.id).order("id"))) {
    const t = parCarte.get(i.card_id) || { total: 0, dispo: 0, holo: false };
    t.total++;
    if (!i.lock) { t.dispo++; if (i.holo) t.holo = true; }
    parCarte.set(i.card_id, t);
  }
  return parCarte;
}
const force = (c) => (c.p || 0) + (c.d || 0) + (c.v || 0);
// Compose un deck valide (6 cartes différentes, au plus 1 légendaire et 2 épiques) dans
// l'ordre de préférence donné. Une carte jouée avec sa holo s'écrit "id*", comme le site.
function deck(coll, tri) {
  const choix = [], parRarete = {};
  for (const c of [...coll.keys()].map((id) => cards[id]).filter((c) => c && coll.get(c.id).dispo > 0).sort(tri)) {
    if (choix.length >= DECK_SIZE) break;
    if (DECK_MAX[c.rarity] !== undefined && (parRarete[c.rarity] || 0) >= DECK_MAX[c.rarity]) continue;
    parRarete[c.rarity] = (parRarete[c.rarity] || 0) + 1;
    choix.push(c.id);
  }
  if (choix.length < DECK_SIZE) return null;
  return choix.map((id) => (coll.get(id).holo ? id + "*" : id));
}
// Gardées en mémoire entre les duels pour limiter les requêtes. null : à relire au prochain duel.
let collections = null;
// Reporte la carte prise au bot. Si elle a été jouée en holo, on ne sait pas quel exemplaire
// est parti : on relira les collections.
function noterPrise(idCarte, dBot) {
  if (!dBot.includes(idCarte)) { collections = null; return; }
  const [mienne, sienne] = collections;
  sienne.get(idCarte).total--;
  sienne.get(idCarte).dispo--;
  const chezMoi = mienne.get(idCarte) || { total: 0, dispo: 0, holo: false };
  chezMoi.total++;
  chezMoi.dispo++;
  mienne.set(idCarte, chezMoi);
}
async function decks() {
  collections ??= await Promise.all([collection(moi), collection(bot)]);
  const [mienne, sienne] = collections;
  // Toi : ton deck le plus fort (comme « Deck automatique » dans le site).
  const dMoi = deck(mienne, (a, b) => force(b) - force(a));
  // Le bot : d'abord ce que tu n'as pas, puis les plus rares, puis les plus faibles.
  const dBot = deck(sienne, (a, b) => (mienne.has(a.id) - mienne.has(b.id)) || (RORDER.indexOf(a.rarity) - RORDER.indexOf(b.rarity)) || (force(a) - force(b)));
  if (!dMoi) die(`Ton compte n'a pas ${DECK_SIZE} cartes différentes disponibles pour un deck.`);
  if (!dBot) die(`Le compte bot n'a pas ${DECK_SIZE} cartes différentes disponibles : ouvre ses boosters (boosters.mjs avec ses identifiants).`);
  return { dMoi, dBot, mienne, nouvelles: dBot.filter((x) => !mienne.has(x.replace("*", ""))).length };
}
const affiche = (d) => d.map((x) => `${nomDe(x.replace("*", ""))}${x.endsWith("*") ? " ✨" : ""}`).join(", ");

// ---------- Duels déjà ouverts entre les deux comptes (run précédent interrompu) ----------
async function nettoyer() {
  const { data, error } = await moi.sb.from("duels").select("id,player_a,player_b,status").in("status", ["waiting", "invited", "active"]);
  if (error) die("Duels illisibles : " + error.message);
  for (const d of data.filter((d) => [d.player_a, d.player_b].includes(moi.me.id) && [d.player_a, d.player_b].includes(bot.me.id))) {
    const r = d.status === "active" ? await bot.sb.rpc("duel_forfeit", { p_duel: d.id }) : await moi.sb.rpc("duel_cancel", { p_duel: d.id });
    console.log(`Duel n°${d.id} resté ${d.status === "active" ? "en cours : le bot abandonne" : "en attente : annulé"}${r.error ? ` (échec : ${r.error.message})` : ""}.`);
  }
}

// ---------- Jouer coup par coup ----------
const vivants = (side) => side.active.map((u, i) => ({ u, i })).filter((x) => x.u && x.u.hp > 0);
// Liste des coups (attaquant, cible) dans l'ordre où on les essaie. Le serveur reste juge :
// un coup refusé (cible cachée, carte étourdie...) passe simplement au suivant.
function coups(st, s, bien) {
  const att = vivants(st.sides[s]).filter((x) => !x.u.stun);
  const cib = vivants(st.sides[1 - s]);
  const sorted = (arr, f) => [...arr].sort(f);
  const A = bien ? sorted(att, (a, b) => (b.u.p || 0) - (a.u.p || 0)) : sorted(att, (a, b) => (a.u.p || 0) - (b.u.p || 0));
  // Toi : les cibles visibles et sans renvoi d'abord, les plus faibles en premier.
  // Le bot : la cible la plus solide (il ne veut surtout pas gagner).
  const T = bien
    ? sorted(cib, (a, b) => (!!a.u.hidden - !!b.u.hidden) || (!!a.u.reflect - !!b.u.reflect) || (a.u.hp - b.u.hp))
    : sorted(cib, (a, b) => b.u.hp - a.u.hp);
  const out = [];
  for (const a of A) for (const t of T) out.push([a.i, t.i]);
  return out;
}
async function jouer(id, row) {
  const cote = row.player_a === moi.me.id ? 0 : 1;
  for (let n = 0; n < MAX_COUPS && row.status === "active"; n++) {
    const st = row.state;
    const joueur = st.turn === cote ? moi : bot;
    let suivant = null, derniere = null;
    for (const [a, t] of coups(st, st.turn, joueur === moi)) {
      const r = await joueur.sb.rpc("duel_play", { p_duel: id, p_a: a, p_t: t });
      if (!r.error && r.data) { suivant = r.data; break; }
      derniere = r.error?.message;
    }
    if (!suivant) {
      // Aucun coup accepté : on relit l'état (le serveur a pu passer le tour tout seul).
      const p = await moi.sb.rpc("duel_poll", { p_duel: id });
      if (!p.error && p.data && p.data.move_no !== row.move_no) { row = p.data; continue; }
      if (joueur === bot) { await bot.sb.rpc("duel_forfeit", { p_duel: id }); break; }
      throw new Error(`aucun coup possible pour toi (${derniere || "sans message"})`);
    }
    row = suivant;
    await pause(150);
  }
  if (row.status === "active") { await bot.sb.rpc("duel_forfeit", { p_duel: id }); }
}

// ---------- Série de duels ----------
await nettoyer();
const depart = restants(await rafraichir(moi));
const aJouer = Math.min(depart, NOMBRE);
const kheysAvant = moi.me.kheys, kheysBotAvant = bot.me.kheys;
console.log(`Duels récompensés restants aujourd'hui : ${depart}. À jouer : ${aJouer}.\n`);

const resultats = []; // { id, victoire, gain, gainBot, carte, nouvelle, erreur }
const echecs = [];
if (DRY) {
  const { dMoi, dBot, nouvelles } = await decks();
  console.log(`Ton deck : ${affiche(dMoi)}`);
  console.log(`Deck du bot : ${affiche(dBot)} (${nouvelles} carte(s) que tu n'as pas)`);
}
for (let k = 0; !DRY && k < aJouer; k++) {
  const { dMoi, dBot, mienne } = await decks();
  const res = { mode: MODE };
  try {
    const c = await moi.sb.rpc("duel_challenge", { p_friend: bot.me.id, p_deck: dMoi });
    if (c.error) throw new Error("défi : " + c.error.message);
    res.id = typeof c.data === "number" ? c.data : c.data?.id;
    if (!res.id) throw new Error("défi : numéro de duel absent de la réponse");
    const a = await bot.sb.rpc("duel_accept", { p_duel: res.id, p_deck: dBot });
    if (a.error) throw new Error("acceptation : " + a.error.message);

    if (MODE === "abandon") {
      const f = await bot.sb.rpc("duel_forfeit", { p_duel: res.id });
      if (f.error) throw new Error("abandon : " + f.error.message);
    } else {
      const p = await moi.sb.rpc("duel_poll", { p_duel: res.id });
      if (p.error) throw new Error("lecture du duel : " + p.error.message);
      await jouer(res.id, p.data);
    }

    // Résultat, puis la carte prise au bot si tu as gagné.
    let row = null;
    for (let essai = 0; essai < 10 && row?.status !== "finished"; essai++) {
      if (essai) await pause(500);
      const p = await moi.sb.rpc("duel_poll", { p_duel: res.id });
      if (!p.error) row = p.data;
    }
    if (row?.status !== "finished") throw new Error(`le duel n'est pas terminé (statut ${row?.status || "inconnu"})`);
    const cote = row.player_a === moi.me.id ? 0 : 1;
    res.victoire = row.winner === moi.me.id;
    res.gain = (cote === 0 ? row.gain_a : row.gain_b) ?? null;
    res.gainBot = (cote === 0 ? row.gain_b : row.gain_a) ?? null;
    const prize = row.state?.prize;
    if (res.victoire && prize && prize.w === cote && !prize.got) {
      const z = await moi.sb.rpc("duel_prize", { p_duel: res.id, p_pick: Math.floor(Math.random() * DECK_SIZE) });
      if (z.error) { res.erreur = "carte non prise : " + z.error.message; collections = null; }
      else { res.carte = z.data?.got; res.nouvelle = !!res.carte && !mienne.has(res.carte); noterPrise(res.carte, dBot); }
    }
    console.log(`  ${res.victoire ? "✓ Victoire" : "✗ Défaite "} n°${res.id}  +${res.gain ?? "?"} K (bot +${res.gainBot ?? "?"} K)${res.carte ? `  · tu prends « ${nomDe(res.carte)} »${res.nouvelle ? " (nouvelle !)" : ""}` : ""}${res.erreur ? `  · ${res.erreur}` : ""}`);

    // Un abandon non récompensé : on joue les coups pour les duels suivants.
    if (MODE === "abandon" && res.victoire && !res.gain) {
      MODE = "jouer";
      console.log("    Le serveur n'a rien donné pour cet abandon : passage en mode jouer pour la suite.");
    }
  } catch (e) {
    res.erreur = e.message;
    echecs.push(res);
    collections = null; // un deck refusé vient peut-être d'une collection dépassée
    console.error(`  ✗ Duel ${res.id ? `n°${res.id}` : k + 1} : ${e.message}`);
    await nettoyer();
    if (echecs.length >= 3) { console.error("Trois échecs : on arrête là."); break; }
  }
  resultats.push(res);
  if (restants(await rafraichir(moi)) === 0) break;
}

// ---------- Compte rendu ----------
await Promise.all([rafraichir(moi), rafraichir(bot)]);
const gagne = moi.me.kheys - kheysAvant, gagneBot = bot.me.kheys - kheysBotAvant;
const joues = resultats.filter((r) => !r.erreur || r.victoire !== undefined);
const L = [`# Duels de ${moi.me.pseudo} contre ${bot.me.pseudo}`, "", new Date().toISOString(), ""];
if (DRY) L.push("DRY-RUN : aucun duel joué.", "", `${depart} duel(s) récompensé(s) restant(s) aujourd'hui.`, "");
else {
  L.push(
    `${joues.length} duel(s) joué(s), ${joues.filter((r) => r.victoire).length} victoire(s). Kheys : ${gagne >= 0 ? "+" : ""}${gagne} K pour toi, ${gagneBot >= 0 ? "+" : ""}${gagneBot} K pour le bot.`,
    `Duels récompensés restants aujourd'hui : ${restants(moi.me)}.`,
    "",
  );
  if (resultats.length) {
    L.push("| Duel | Mode | Résultat | Gain | Gain du bot | Carte prise | Remarque |", "|---:|---|---|---:|---:|---|---|");
    for (const r of resultats) L.push(`| ${r.id ?? "—"} | ${r.mode} | ${r.victoire === undefined ? "—" : r.victoire ? "Victoire" : "Défaite"} | ${r.gain ?? "?"} K | ${r.gainBot ?? "?"} K | ${r.carte ? nomDe(r.carte) + (r.nouvelle ? " (nouvelle)" : "") : "—"} | ${r.erreur || ""} |`);
    L.push("");
  }
}
writeFileSync("duels.md", L.join("\n") + "\n");
console.log(`\n${DRY ? "" : `Kheys : ${gagne >= 0 ? "+" : ""}${gagne} K pour toi, ${gagneBot >= 0 ? "+" : ""}${gagneBot} K pour le bot. `}Compte rendu dans duels.md.`);
if (echecs.length) process.exitCode = 1;
