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

import { writeFileSync } from "node:fs";
import { connecter, lireTout } from "./session.mjs";
import { numerosSite } from "./numeros.mjs";

const { REF_EMAIL, REF_PASS, BOT_EMAIL, BOT_PASS } = process.env;
if (!REF_EMAIL || !REF_PASS) throw new Error("REF_EMAIL / REF_PASS manquants");
if (BOT_EMAIL && BOT_EMAIL.trim().toLowerCase() === REF_EMAIL.trim().toLowerCase()) {
  throw new Error("BOT_EMAIL doit être un autre compte que REF_EMAIL");
}

const die = (m) => { console.error(m); process.exit(1); };

const { sb, me, error } = await connecter(REF_EMAIL, REF_PASS);
if (error) die(error);

const RAR = { L: "Légendaires", E: "Épiques", R: "Rares", C: "Communes" };
const ORDER = ["L", "E", "R", "C"];

const genDe = (c) => c.gen || 1;

const cards = await lireTout(() => sb.from("cards").select("id,name,rarity,n,active,gen").order("id"));
const mineIds = new Set((await lireTout(() => sb.from("card_instances").select("id,card_id").eq("owner", me.id).order("id"))).map((r) => r.card_id));
const missing = cards.filter((c) => !mineIds.has(c.id));

const numero = numerosSite(cards);
const noDe = (c) => (numero.has(c.id) ? `n°${numero.get(c.id)}` : "HS");

// Cartes du bot : celles en vente ou dans un échange (lock) ne peuvent pas être transférées.
const chezBot = new Map(); // card_id -> exemplaires transférables
if (BOT_EMAIL && BOT_PASS) {
  const bot = await connecter(BOT_EMAIL, BOT_PASS);
  if (bot.error) die(`Compte bot : ${bot.error}`);
  for (const i of await lireTout(() => bot.sb.from("card_instances").select("id,card_id,lock").eq("owner", bot.me.id).order("id"))) {
    if (!i.lock) chezBot.set(i.card_id, (chezBot.get(i.card_id) ?? 0) + 1);
  }
}
const botDe = (c) => (chezBot.has(c.id) ? ` 🤖 x${chezBot.get(c.id)}` : "");

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
