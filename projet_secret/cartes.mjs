// Affiche en JSON les cartes d'un compte et le nombre de cartes qui lui manquent.
//
//   node projet_secret/cartes.mjs --email=adresse@exemple.com --password='mot_de_passe'
//
// La sortie standard ne contient que le JSON : les erreurs partent sur la sortie d'erreur.

import { createClient } from "@supabase/supabase-js";

const URL = "https://driraijgakhmnsxepuot.supabase.co";
const KEY = "sb_publishable_BgXnR1FLTcLLajt3id9q_A_RI6JAw1N";

const stop = (msg) => {
  console.error(msg);
  process.exit(1);
};
const option = (nom) =>
  process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);

const email = option("email")?.trim();
const password = option("password");
if (!email || !password) stop("Indique le compte : --email=… --password=…");

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { error } = await sb.auth.signInWithPassword({ email, password });
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

const catalogue = (
  await fetchAll(() => sb.from("cards").select("id,name,rarity,n,gen").order("n"))
).filter((c) => (c.gen || 1) === 1);
const instances = await fetchAll(() =>
  sb.from("card_instances").select("card_id,holo").eq("owner", me.id).order("id"),
);

const possedees = new Map();
for (const { card_id, holo } of instances) {
  const c = possedees.get(card_id) ?? { exemplaires: 0, holos: 0 };
  c.exemplaires++;
  if (holo) c.holos++;
  possedees.set(card_id, c);
}

console.log(
  JSON.stringify({
    manquantes: catalogue.filter((c) => !possedees.has(c.id)).length,
    cartes: catalogue
      .filter((c) => possedees.has(c.id))
      .map((c) => ({ n: c.n, nom: c.name, rarete: c.rarity, ...possedees.get(c.id) })),
  }),
);
