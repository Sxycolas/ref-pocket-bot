// Affiche en JSON, par génération, les doublons qu'il manque pour monter toutes les cartes au niveau max.
//
//   node projet_secret/niveaux.mjs --email=adresse@exemple.com --password='mot_de_passe'
//
// Le k-ième niveau coûte k doublons simples (ni holos, ni cartes en vente), et il faut garder
// un exemplaire : de L à 5, il faut donc (L+1)+…+5 doublons. Pour chaque carte active, le manque
// est ce coût moins les doublons simples déjà là. Sortie : {"1": {"manque": n, "cartes": m}, "2": …},
// où m est le nombre de cartes qui ne sont pas encore au niveau max. Les logs partent sur la sortie d'erreur.

import { ouvrirSession, lireTout } from "../session.mjs";

const NIVEAU_MAX = 5; // LVL_MAX dans cartes.js du site

const log = (...a) => console.error(new Date().toISOString(), ...a);
const stop = (msg) => {
  log(msg);
  process.exit(1);
};
const option = (nom) =>
  process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);

const email = option("email")?.trim();
const password = option("password");
if (!email || !password) stop("Indique le compte : --email=… --password=…");

const { sb, error } = await ouvrirSession(email, password);
if (error) stop(`Connexion impossible : ${error.message}`);
const me = (await sb.rpc("my_profile")).data;
if (!me?.id) stop("Profil introuvable.");

const catalogue = await lireTout(() => sb.from("cards").select("id,gen,active").order("id"));
const niveaux = new Map(
  (await lireTout(() => sb.from("card_levels").select("card_id,level").eq("owner", me.id).order("card_id"))).map((l) => [l.card_id, l.level]),
);
const simples = new Map();
for (const i of await lireTout(() => sb.from("card_instances").select("card_id,holo,lock").eq("owner", me.id).order("id"))) {
  if (!i.holo && !i.lock) simples.set(i.card_id, (simples.get(i.card_id) ?? 0) + 1);
}

const resultat = { 1: { manque: 0, cartes: 0 }, 2: { manque: 0, cartes: 0 } };
for (const c of catalogue) {
  if (!c.active) continue;
  const niveau = niveaux.get(c.id) ?? 0;
  if (niveau >= NIVEAU_MAX) continue;
  let cout = 0;
  for (let k = niveau + 1; k <= NIVEAU_MAX; k++) cout += k;
  const dispo = Math.max(0, (simples.get(c.id) ?? 0) - 1);
  const g = resultat[c.gen || 1];
  g.cartes++;
  g.manque += Math.max(0, cout - dispo);
}
log(`${me.pseudo} : Gén. 1 : ${resultat[1].manque} doublons manquants, Gén. 2 : ${resultat[2].manque}.`);
console.log(JSON.stringify(resultat));
