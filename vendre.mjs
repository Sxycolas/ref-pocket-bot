// Ref Pocket : met en vente, à prix réduit, les exemplaires qui ne te servent plus.
//
// Ce qui est vendu :
//   - les holos en double : on en garde 1 par carte, car il suffit d'en posséder une
//     pour la jouer en duel (Éclat holo : +3 dégâts) ; les suivantes ne servent à rien
//     (les holos ne comptent jamais comme doublons pour les améliorations) ;
//   - sur une carte au niveau maximum (5), tout ce qui dépasse 2 exemplaires : elle ne
//     peut plus monter, donc ses doublons n'ont plus d'usage. Les holos partent d'abord
//     s'il y en a plusieurs, puis les normales, et on garde toujours 1 holo.
//
// Règles communes :
//   - pour varier les offres, une carte n'a qu'une annonce à la fois : tant qu'un
//     exemplaire est en vente, les autres attendent, et une relance du script met le
//     suivant en vente une fois le premier parti ;
//   - un exemplaire déjà en vente ou dans un échange (« lock ») n'est jamais touché, et
//     ne compte pas parmi ceux qu'on garde ;
//   - le prix de référence est celui proposé par le jeu (valeur de la rareté, × 3 pour
//     une holo), moins la remise, sans jamais descendre sous ce que rapporterait une
//     défausse de la carte.
//
//   REF_EMAIL=... REF_PASS=... node vendre.mjs      -> met en vente pour de vrai
//   ... node vendre.mjs --dry                       -> n'affiche que ce qui serait vendu
//   ... node vendre.mjs --remise=40                 -> remise en % (20 par défaut)
//   ... node vendre.mjs --retirer                   -> retire toutes tes annonces ouvertes
//   ... node vendre.mjs --retirer=141,176           -> retire seulement ces numéros de carte
//   npm run vendre -- --dry     (lit le .env en local ; secrets sur GitHub Actions)
//
// Écrit un compte rendu dans ventes.md.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const URL = "https://driraijgakhmnsxepuot.supabase.co";
const KEY = "sb_publishable_BgXnR1FLTcLLajt3id9q_A_RI6JAw1N";
const { REF_EMAIL, REF_PASS } = process.env;
if (!REF_EMAIL || !REF_PASS) throw new Error("REF_EMAIL / REF_PASS manquants");

const DRY = process.argv.includes("--dry");
const remiseArg = process.argv.find((a) => a.startsWith("--remise="));
const REMISE = remiseArg ? Number(remiseArg.slice("--remise=".length)) : 20;
if (!Number.isInteger(REMISE) || REMISE < 1 || REMISE > 90) throw new Error("--remise doit être un entier entre 1 et 90");

const retirerArg = process.argv.find((a) => a === "--retirer" || a.startsWith("--retirer="));
const NUMEROS = retirerArg?.includes("=") ? retirerArg.slice("--retirer=".length).split(",").map((x) => x.trim()) : null;
if (NUMEROS && !NUMEROS.every((x) => /^\d+$/.test(x))) throw new Error("--retirer= attend des numéros de carte séparés par des virgules (ex. --retirer=141,176)");

const NIVEAU_MAX = 5; // LVL_MAX dans cartes.js du site
const GARDER = 1; // exemplaires disponibles conservés sur une carte qui peut encore monter
const GARDER_NIVEAU_MAX = 2; // ... et sur une carte au niveau maximum

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const die = (m) => { console.error(m); process.exit(1); };

{
  const { error } = await sb.auth.signInWithPassword({ email: REF_EMAIL, password: REF_PASS });
  if (error) die("Connexion impossible : " + error.message);
}
const me = (await sb.rpc("my_profile")).data;
if (!me?.id) die("Profil introuvable.");

async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// Mêmes valeurs que RARITIES dans cartes.js du site (elles n'existent que côté client).
const RAR = {
  L: { name: "Légendaires", value: 800, discard: 200 },
  E: { name: "Épiques", value: 200, discard: 50 },
  R: { name: "Rares", value: 60, discard: 15 },
  C: { name: "Communes", value: 20, discard: 5 },
};
const ORDER = ["L", "E", "R", "C"];
const prixDe = (r, holo) => {
  const m = holo ? 3 : 1;
  return Math.max(RAR[r].discard * m, Math.round((RAR[r].value * m * (100 - REMISE)) / 100));
};

const cards = Object.fromEntries((await fetchAll(() => sb.from("cards").select("id,name,rarity,n").order("id"))).map((c) => [c.id, c]));

// ---------- Mode --retirer : retire des annonces au lieu d'en créer ----------
if (retirerArg) {
  const annonces = await fetchAll(() => sb.from("listings").select("id,price,inst:card_instances(card_id,holo)").eq("seller", me.id).eq("status", "open").order("id"));
  const visees = annonces
    .map((l) => ({ id: l.id, prix: l.price, holo: l.inst?.holo, carte: cards[l.inst?.card_id] }))
    .filter((l) => !NUMEROS || NUMEROS.includes(String(l.carte?.n)));
  const sansAnnonce = (NUMEROS || []).filter((x) => !visees.some((l) => String(l.carte?.n) === x));

  console.log(`${me.pseudo} : ${visees.length} annonce(s) à retirer sur ${annonces.length} ouverte(s).${DRY ? "  (DRY-RUN : rien ne sera retiré)" : ""}\n`);

  const retirees = [];
  const echecs = []; // { name, message }
  for (const l of visees) {
    const name = l.carte?.name || `annonce #${l.id}`;
    if (!DRY) {
      const r = await sb.rpc("cancel_listing", { p_listing: l.id });
      if (r.error) {
        echecs.push({ name, message: r.error.message });
        console.error(`  ✗ ${name} : ${r.error.message}`);
        continue;
      }
    }
    retirees.push(l);
    console.log(`  ${DRY ? "·" : "✓"} n°${String(l.carte?.n ?? "?").padEnd(4)} ${name.slice(0, 44).padEnd(44)} ${(l.holo ? "holo" : "normale").padEnd(8)} ${l.prix} K`);
  }

  const verbe = DRY ? "à retirer" : "retirée(s)";
  const R = [`# Annonces retirées pour ${me.pseudo}`, "", new Date().toISOString(), ""];
  if (DRY) R.push("DRY-RUN : rien n'a été retiré.", "");
  R.push(`${retirees.length} annonce(s) ${verbe} sur ${annonces.length} ouverte(s).`, "");
  if (retirees.length) {
    R.push("| N° | Carte | Exemplaire | Prix |", "|---:|---|---|---:|");
    for (const l of retirees) R.push(`| ${l.carte?.n ?? "?"} | ${l.carte?.name || `annonce #${l.id}`} | ${l.holo ? "Holo" : "Normale"} | ${l.prix} K |`);
    R.push("");
  }
  if (sansAnnonce.length) R.push(`Aucune annonce ouverte pour : ${sansAnnonce.map((x) => `n°${x}`).join(", ")}.`, "");
  if (echecs.length) {
    R.push(`## Échecs (${echecs.length})`, "");
    for (const e of echecs) R.push(`- ${e.name} : ${e.message}`);
    R.push("");
  }
  writeFileSync("ventes.md", R.join("\n") + "\n");

  console.log(`\n${retirees.length} annonce(s) ${verbe}.${echecs.length ? ` ${echecs.length} échec(s).` : ""}`);
  if (sansAnnonce.length) console.log(`Aucune annonce ouverte pour : ${sansAnnonce.map((x) => `n°${x}`).join(", ")}.`);
  console.log("Compte rendu dans ventes.md.");
  process.exit(echecs.length ? 1 : 0);
}

const niveaux = Object.fromEntries((await fetchAll(() => sb.from("card_levels").select("card_id,level").eq("owner", me.id).order("card_id"))).map((l) => [l.card_id, l.level]));

// Regroupe les exemplaires par carte (triés : on garde les plus anciens).
const parCarte = new Map();
for (const i of await fetchAll(() => sb.from("card_instances").select("id,card_id,holo,lock").eq("owner", me.id).order("id"))) {
  const t = parCarte.get(i.card_id) || { holos: [], simples: [], enVente: 0 };
  if (!i.lock) (i.holo ? t.holos : t.simples).push(i.id);
  else if (i.lock === "listing") t.enVente++;
  parCarte.set(i.card_id, t);
}

// L'exemplaire à mettre en vente pour cette carte, ou null s'il n'y en a aucun.
function choisir(t, niveauMax) {
  if (t.enVente > 0) return null;
  if (t.holos.length + t.simples.length <= (niveauMax ? GARDER_NIVEAU_MAX : GARDER)) return null;
  if (t.holos.length > 1) return { instance: t.holos.at(-1), holo: true };
  if (niveauMax && t.simples.length > 0) return { instance: t.simples.at(-1), holo: false };
  return null;
}

const aVendre = [];
const ignorees = []; // rareté inconnue : pas de prix fiable, on saute la carte
for (const [id, t] of parCarte) {
  const niveauMax = (niveaux[id] || 0) >= NIVEAU_MAX;
  const choix = choisir(t, niveauMax);
  if (!choix) continue;
  if (!RAR[cards[id]?.rarity]) { ignorees.push(cards[id]?.name || id); continue; }
  aVendre.push({ ...cards[id], ...choix, niveauMax, prix: prixDe(cards[id].rarity, choix.holo) });
}
aVendre.sort((a, b) => ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity) || a.n - b.n);

console.log(`${me.pseudo} : ${aVendre.length} carte(s) à mettre en vente (1 annonce par carte), remise de ${REMISE} %.${DRY ? "  (DRY-RUN : rien ne sera mis en vente)" : ""}\n`);

const echecs = []; // { name, message }
for (const c of aVendre) {
  if (!DRY) {
    const r = await sb.rpc("list_card", { p_instance: c.instance, p_price: c.prix });
    if (r.error) {
      c.echec = true;
      echecs.push({ name: c.name, message: r.error.message });
      console.error(`  ✗ ${c.name} : ${r.error.message}`);
      continue;
    }
  }
  console.log(`  ${DRY ? "·" : "✓"} n°${String(c.n).padEnd(4)} ${c.name.slice(0, 44).padEnd(44)} ${(c.holo ? "holo" : "normale").padEnd(8)} ${c.prix} K${c.niveauMax ? "  (niveau max)" : ""}`);
}
const vendues = aVendre.filter((c) => !c.echec);
const total = vendues.reduce((s, c) => s + c.prix, 0);

// ---------- Compte rendu ----------
const verbe = DRY ? "à mettre en vente" : "mise(s) en vente";
const L = [`# Ventes pour ${me.pseudo}`, "", new Date().toISOString(), ""];
if (DRY) L.push("DRY-RUN : rien n'a été mis en vente.", "");
L.push(`${vendues.length} carte(s) ${verbe} avec une remise de ${REMISE} %, pour ${total} K au total si tout part. Une annonce à la fois par carte.`, "");
for (const r of ORDER) {
  const g = vendues.filter((c) => c.rarity === r);
  if (!g.length) continue;
  L.push(`## ${RAR[r].name}`, "", "| N° | Carte | Exemplaire | Prix | Niveau max |", "|---:|---|---|---:|---|");
  for (const c of g) L.push(`| ${c.n} | ${c.name} | ${c.holo ? "Holo" : "Normale"} | ${c.prix} K | ${c.niveauMax ? "Oui" : "Non"} |`);
  L.push("");
}
if (echecs.length) {
  L.push(`## Échecs (${echecs.length})`, "");
  for (const e of echecs) L.push(`- ${e.name} : ${e.message}`);
  L.push("");
}
if (ignorees.length) {
  L.push(`## Ignorées, rareté inconnue (${ignorees.length})`, "");
  for (const n of ignorees) L.push(`- ${n}`);
  L.push("");
}
writeFileSync("ventes.md", L.join("\n") + "\n");

console.log(`\n${vendues.length} carte(s) ${verbe}, ${total} K au total si tout part.${echecs.length ? ` ${echecs.length} échec(s).` : ""}`);
if (ignorees.length) console.log(`${ignorees.length} carte(s) ignorée(s), rareté inconnue.`);
console.log("Compte rendu dans ventes.md.");
if (echecs.length) process.exitCode = 1;
