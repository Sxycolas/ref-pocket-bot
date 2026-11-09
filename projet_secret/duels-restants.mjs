// Affiche en JSON le nombre de duels récompensés qu'il reste aujourd'hui à ce compte.
//
//   node projet_secret/duels-restants.mjs --email=adresse@exemple.com --password='mot_de_passe'
//
// La sortie standard ne contient que le nombre : les erreurs partent sur la sortie d'erreur.

import { createClient } from "@supabase/supabase-js";

const URL = "https://driraijgakhmnsxepuot.supabase.co";
const KEY = "sb_publishable_BgXnR1FLTcLLajt3id9q_A_RI6JAw1N";
const DUEL_DAILY = 10; // même valeur que le site

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

const { data: me, error: erreurProfil } = await sb.rpc("my_profile");
if (erreurProfil || !me?.id) stop(`Profil introuvable : ${erreurProfil?.message ?? "vide"}`);

// Même calcul que le site : le compteur repart à zéro à minuit UTC
const aujourdhui = new Date().toISOString().slice(0, 10);
console.log(Math.max(0, me.daily_day === aujourdhui ? DUEL_DAILY - me.daily_n : DUEL_DAILY));
