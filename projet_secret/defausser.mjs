// Défausse les exemplaires en surplus des cartes déjà au niveau maximum (5) d'un compte.
//
//   node projet_secret/defausser.mjs --email=adresse@exemple.com --password='mot_de_passe' [--dry]
//
// Une carte au niveau maximum ne peut plus monter : on n'en garde que 2 exemplaires (comme
// vendre.mjs), dont au moins 1 holo s'il y en a un. Les normales partent d'abord. Les cartes
// en vente ou dans un échange (« lock ») ne sont jamais touchées. Avec --dry, rien n'est défaussé.

import { ouvrirSession, lireTout } from "../session.mjs";

const NIVEAU_MAX = 5; // LVL_MAX dans cartes.js du site
const GARDER = 2; // exemplaires conservés sur une carte au niveau maximum

const log = (...a) => console.log(new Date().toISOString(), ...a);
const stop = (msg) => {
  log(msg);
  process.exit(1);
};
const option = (nom) =>
  process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const dry = process.argv.includes("--dry");

const email = option("email")?.trim();
const password = option("password");
if (!email || !password) stop("Indique le compte : --email=… --password=…");

const { sb, error } = await ouvrirSession(email, password);
if (error) stop(`Connexion impossible : ${error.message}`);
const me = (await sb.rpc("my_profile")).data;
if (!me?.id) stop("Profil introuvable.");
log(`Défausse des surplus au niveau max pour ${me.pseudo}${dry ? " (dry : rien ne sera défaussé)" : ""}.`);

const noms = new Map((await lireTout(() => sb.from("cards").select("id,name").order("id"))).map((c) => [c.id, c.name]));
const niveaux = new Map(
  (await lireTout(() => sb.from("card_levels").select("card_id,level").eq("owner", me.id).order("card_id"))).map((l) => [l.card_id, l.level]),
);

const parCarte = new Map();
for (const i of await lireTout(() => sb.from("card_instances").select("id,card_id,holo,lock").eq("owner", me.id).order("id"))) {
  if (i.lock) continue;
  const t = parCarte.get(i.card_id) ?? { holos: [], simples: [] };
  (i.holo ? t.holos : t.simples).push(i.id);
  parCarte.set(i.card_id, t);
}

let defaussees = 0;
let gain = 0;
for (const [idCarte, t] of parCarte) {
  if ((niveaux.get(idCarte) ?? 0) < NIVEAU_MAX) continue;
  let exces = t.holos.length + t.simples.length - GARDER;
  const jeter = [];
  while (exces > 0 && t.simples.length) { jeter.push(t.simples.pop()); exces--; }
  while (exces > 0 && t.holos.length > 1) { jeter.push(t.holos.pop()); exces--; }
  if (!jeter.length) continue;

  let nombre = 0;
  for (const instance of jeter) {
    if (dry) { nombre++; continue; }
    const r = await sb.rpc("discard_card", { p_instance: instance });
    if (r.error) {
      log(`  ✗ ${noms.get(idCarte) ?? idCarte} : défausse impossible : ${r.error.message}`);
      break;
    }
    gain += Number(r.data) || 0;
    nombre++;
  }
  defaussees += nombre;
  log(`  ${dry ? "·" : "🗑"} ${noms.get(idCarte) ?? idCarte} (niveau max) : ${nombre} exemplaire(s) défaussé(s).`);
}

log(`Terminé : ${defaussees} exemplaire(s) défaussé(s)${dry ? " (dry)" : `, +${gain} K`}.`);
