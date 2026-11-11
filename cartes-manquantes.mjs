// Ref Pocket : liste les cartes du catalogue que tu n'as pas encore.
// Se reconnecte et relit ta collection à chaque exécution (rien n'est mis en cache).
//
//   REF_EMAIL=... REF_PASS=... node cartes-manquantes.mjs
//   npm run manquantes          (lit le .env en local ; secrets sur GitHub Actions)
//
// Écrit cartes-manquantes.md et affiche la liste dans le terminal.
//
// Facultatif : avec BOT_EMAIL / BOT_PASS (le compte bot des duels), chaque carte manquante que
// le bot possède est signalée, avec le nombre d'exemplaires transférables vers ton compte.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { ouvrirSession } from "./session.mjs";

const URL = "https://driraijgakhmnsxepuot.supabase.co";
const KEY = "sb_publishable_BgXnR1FLTcLLajt3id9q_A_RI6JAw1N";
const { REF_EMAIL, REF_PASS, BOT_EMAIL, BOT_PASS } = process.env;
if (!REF_EMAIL || !REF_PASS) throw new Error("REF_EMAIL / REF_PASS manquants");
if (BOT_EMAIL && BOT_EMAIL.trim().toLowerCase() === REF_EMAIL.trim().toLowerCase()) {
  throw new Error("BOT_EMAIL doit être un autre compte que REF_EMAIL");
}

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

const RAR = { L: "Légendaires", E: "Épiques", R: "Rares", C: "Communes" };
const ORDER = ["L", "E", "R", "C"];

const genDe = (c) => c.gen || 1;

const cards = await fetchAll(() => sb.from("cards").select("id,name,rarity,n,active,gen").order("n"));
const mineIds = new Set((await fetchAll(() => sb.from("card_instances").select("card_id").eq("owner", me.id))).map((r) => r.card_id));
const missing = cards.filter((c) => !mineIds.has(c.id));

// Numéro affiché sur le site : chaque génération repart à 1 (cartes en boosters triées par n),
// les cartes hors boosters n'ont pas de numéro (« HS »).
const numero = new Map();
for (const gen of new Set(cards.map(genDe))) {
  cards.filter((c) => genDe(c) === gen && c.active).sort((a, b) => a.n - b.n).forEach((c, i) => numero.set(c.id, i + 1));
}
const noDe = (c) => (numero.has(c.id) ? `n°${numero.get(c.id)}` : "HS");

// Cartes du bot : celles en vente ou dans un échange (lock) ne peuvent pas être transférées.
const chezBot = new Map(); // card_id -> { dispo, holo, bloquees }
if (BOT_EMAIL && BOT_PASS) {
  const { sb: sbBot, error } = await ouvrirSession(BOT_EMAIL, BOT_PASS);
  if (error) die("Connexion au compte bot impossible : " + error.message);
  const p = (await sbBot.rpc("my_profile")).data;
  if (!p?.id) die("Profil du compte bot introuvable.");
  for (const i of await fetchAll(() => sbBot.from("card_instances").select("id,card_id,holo,lock").eq("owner", p.id).order("id"))) {
    const t = chezBot.get(i.card_id) ?? { dispo: 0, holo: 0, bloquees: 0 };
    if (i.lock) t.bloquees++;
    else { t.dispo++; if (i.holo) t.holo++; }
    chezBot.set(i.card_id, t);
  }
}
const transferable = (c) => (chezBot.get(c.id)?.dispo ?? 0) > 0;
const botDe = (c) => (transferable(c) ? ` 🤖 x${chezBot.get(c.id).dispo}` : "");

const lines = [`# Cartes manquantes pour ${me.pseudo}`, "", `Au ${new Date().toISOString()} : ${missing.length} manquante(s) sur ${cards.length} (tu en as ${mineIds.size}).`, ""];
console.log(`${me.pseudo} : ${mineIds.size}/${cards.length} cartes. Il te manque ${missing.length} cartes.\n`);
// La génération la plus récente d'abord.
for (const gen of [...new Set(cards.map(genDe))].sort((a, b) => b - a)) {
  const total = cards.filter((c) => genDe(c) === gen).length;
  const manquantes = missing.filter((c) => genDe(c) === gen);
  const titre = `Génération ${gen} : il te manque ${manquantes.length} carte(s) sur ${total}`;
  console.log(`##### ${titre} #####\n`);
  lines.push(`## ${titre}`, "");
  for (const r of ORDER) {
    const g = manquantes.filter((c) => c.rarity === r).sort((a, b) => a.n - b.n);
    if (!g.length) continue;
    console.log(`=== ${RAR[r]} (${g.length}) ===`);
    lines.push(`### ${RAR[r]} (${g.length})`);
    for (const c of g) {
      const suffix = c.active ? "" : " (hors boosters)";
      console.log(`  ${noDe(c)} ${c.name}${suffix}${botDe(c)}`);
      lines.push(`- ${noDe(c)} ${c.name}${suffix}${botDe(c)}`);
    }
    console.log("");
    lines.push("");
  }
}
if (!missing.length) lines.push("Collection complète, félicitations !");

writeFileSync("cartes-manquantes.md", lines.join("\n") + "\n");
console.log("Liste écrite dans cartes-manquantes.md.");
