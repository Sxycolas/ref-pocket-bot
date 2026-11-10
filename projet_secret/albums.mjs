// Réclame les récompenses des albums complétés d'un compte et affiche le résultat en JSON.
//
//   node projet_secret/albums.mjs --email=adresse@exemple.com --password='mot_de_passe'
//
// La sortie standard ne contient que le JSON : les erreurs partent sur la sortie d'erreur.

import { ouvrirSession } from "../session.mjs";

const stop = (msg) => {
  console.error(msg);
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

async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await build().range(from, from + 999);
    if (e) stop(`Lecture impossible : ${e.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const catalogue = await fetchAll(() => sb.from("cards").select("id,type,gen,active").order("n"));
const instances = await fetchAll(() =>
  sb.from("card_instances").select("card_id").eq("owner", me.id).order("id"),
);
const claims = await fetchAll(() => sb.from("album_claims").select("album").eq("owner", me.id));

const possedees = new Set(instances.map((i) => i.card_id));
const dejaReclames = new Set(claims.map((c) => c.album));

// Mêmes albums que le site, par génération : un par type et un complet ("*"), préfixés "2:" en Gén. 2
const albums = [];
for (const gen of [1, 2]) {
  const prefixe = gen === 2 ? "2:" : "";
  const actives = catalogue.filter((c) => c.active && (c.gen || 1) === gen);
  if (actives.length) albums.push({ cle: `${prefixe}*`, cartes: actives });
  for (const type of new Set(actives.map((c) => c.type))) {
    albums.push({ cle: prefixe + type, cartes: actives.filter((c) => c.type === type) });
  }
}

const reclames = [];
for (const { cle, cartes } of albums) {
  if (dejaReclames.has(cle) || !cartes.every((c) => possedees.has(c.id))) continue;
  const r = await sb.rpc("claim_album", { p_type: cle });
  if (r.error) console.error(`Album ${cle} refusé : ${r.error.message}`);
  else reclames.push({ album: cle, kheys: r.data });
}

console.log(JSON.stringify(reclames));
