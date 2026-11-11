// Ref Pocket : liste toutes tes cartes que tu possèdes en plusieurs exemplaires.
// Pour chacune : nombre total, combien de holos, combien de « simples » (non-holo,
// non mises en vente) et combien de doublons tu peux donner/sacrifier en gardant 1.
// Se reconnecte et relit ta collection à chaque exécution.
//
//   REF_EMAIL=... REF_PASS=... node doublons.mjs
//   npm run doublons            (lit le .env en local ; secrets sur GitHub Actions)
//
// Écrit doublons.md et affiche le tableau dans le terminal.

import { writeFileSync } from "node:fs";
import { connecter, lireTout } from "./session.mjs";
import { numerosSite } from "./numeros.mjs";

const { REF_EMAIL, REF_PASS } = process.env;
if (!REF_EMAIL || !REF_PASS) throw new Error("REF_EMAIL / REF_PASS manquants");

const die = (m) => { console.error(m); process.exit(1); };

const { sb, me, error } = await connecter(REF_EMAIL, REF_PASS);
if (error) die(error);

const RAR = { L: "Légendaires", E: "Épiques", R: "Rares", C: "Communes" };
const ORDER = ["L", "E", "R", "C"];

const catalogue = await lireTout(() => sb.from("cards").select("id,name,rarity,n,gen,active").order("id"));
const cards = Object.fromEntries(catalogue.map((c) => [c.id, c]));
const numero = numerosSite(catalogue); // numéro du site : chaque génération repart à 1

// Regroupe les exemplaires par carte.
const m = new Map();
for (const r of await lireTout(() => sb.from("card_instances").select("id,card_id,holo,lock").eq("owner", me.id).order("id"))) {
  const t = m.get(r.card_id) || { total: 0, holo: 0, simple: 0, vente: 0 };
  t.total++;
  // holo et « en vente » sont indépendants : un exemplaire peut être les deux.
  if (r.holo) t.holo++; else t.simple++;
  if (r.lock) t.vente++;
  m.set(r.card_id, t);
}

// Doublons = au moins 2 exemplaires. On trie par rareté puis dans l'ordre du site.
const dups = [...m.entries()]
  .filter(([, t]) => t.total >= 2)
  .map(([id, t]) => ({ id, ...t, name: cards[id]?.name || id, r: cards[id]?.rarity || "C", n: cards[id]?.n ?? 0, no: numero.get(id) ?? "HS", gen: cards[id]?.gen || 1 }))
  .sort((a, b) => ORDER.indexOf(a.r) - ORDER.indexOf(b.r) || a.n - b.n);
// La génération la plus récente d'abord.
const GENS = [...new Set(dups.map((d) => d.gen))].sort((a, b) => b - a);

const totalDup = dups.reduce((s, d) => s + (d.total - 1), 0);
const totalHolo = dups.reduce((s, d) => s + d.holo, 0);

const lines = [
  `# Cartes en doublon pour ${me.pseudo}`,
  "",
  `Au ${new Date().toISOString()} : ${dups.length} carte(s) possédée(s) en plusieurs exemplaires, ${totalDup} exemplaire(s) en trop, dont ${totalHolo} holo(s).`,
  "",
];
console.log(`${me.pseudo} : ${dups.length} cartes en doublon (${totalDup} exemplaires en trop, ${totalHolo} holos).\n`);

for (const gen of GENS) for (const r of ORDER) {
  const g = dups.filter((d) => d.gen === gen && d.r === r);
  if (!g.length) continue;
  lines.push(`## Génération ${gen} · ${RAR[r]} (${g.length})`, "", "| N° | Carte | Total | Holos | Simples | En vente |", "|---:|---|---:|---:|---:|---:|");
  console.log(`=== Génération ${gen} · ${RAR[r]} (${g.length}) ===`);
  for (const d of g) {
    lines.push(`| ${d.no} | ${d.name} | ${d.total} | ${d.holo} | ${d.simple} | ${d.vente} |`);
    console.log(`  n°${String(d.no).padEnd(4)} ${d.name.slice(0, 40).padEnd(40)} total=${d.total}  holos=${d.holo}  simples=${d.simple}${d.vente ? `  vente=${d.vente}` : ""}`);
  }
  lines.push("");
  console.log("");
}
if (!dups.length) lines.push("Aucune carte en doublon.");

writeFileSync("doublons.md", lines.join("\n") + "\n");
console.log("Tableau écrit dans doublons.md.");
