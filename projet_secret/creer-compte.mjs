// Crée un compte Ref Pocket, choisit son pseudo, puis ouvre ses boosters avec bot.mjs.
//
//   npm run compte -- --email=adresse@exemple.com --password='mot_de_passe' --pseudo=MonPseudo
//   ... --gen=1                                     -> ouvre des boosters de Gén. 1 (Gén. 2 par défaut)
//
// Chaque compte est ajouté à compte-auto.json (jamais commité).

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL = "https://driraijgakhmnsxepuot.supabase.co";
const KEY = "sb_publishable_BgXnR1FLTcLLajt3id9q_A_RI6JAw1N";
const FICHIER = join(import.meta.dirname, "compte-auto.json");

const log = (...a) => console.log(new Date().toISOString(), ...a);
const stop = (msg) => {
  log(msg);
  process.exit(1);
};
const option = (nom) =>
  process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);

const email = option("email")?.trim();
const password = option("password");
const pseudo = option("pseudo")?.trim();

if (!email || !password || !pseudo) {
  stop("Indique le compte : npm run compte -- --email=adresse@exemple.com --password='mot_de_passe' --pseudo=MonPseudo");
}
if (!/^\S+@\S+\.\S+$/.test(email)) stop("Adresse e-mail invalide.");
if (password.length < 6) stop("Le mot de passe doit faire au moins 6 caractères.");
if (pseudo.length < 3 || pseudo.length > 20) stop("Le pseudo doit faire entre 3 et 20 caractères.");

// Vérifié avant l'inscription : un « --gen 1 » mal écrit ouvrirait sinon des boosters de Gén. 2
const genArg = process.argv.find((a) => a.startsWith("--gen"));
const gen = genArg ? genArg.split("=")[1] : "2";
if (!["1", "2"].includes(gen)) stop("--gen attend 1 ou 2 (ex. --gen=1).");

// Lu avant l'inscription : un fichier illisible doit arrêter le script, pas être écrasé
const sauvegarde = existsSync(FICHIER) ? JSON.parse(readFileSync(FICHIER, "utf8")) : [];
const comptes = Array.isArray(sauvegarde) ? sauvegarde : [sauvegarde]; // ancien format : un seul compte

// Appelé seulement après une authentification réussie : un essai raté n'écrase aucun mot de passe
function enregistrer(pseudoDuCompte) {
  const compte = { email, password, pseudo: pseudoDuCompte };
  const i = comptes.findIndex((c) => c.email.toLowerCase() === email.toLowerCase());
  if (i >= 0) comptes[i] = compte;
  else comptes.push(compte);

  const temporaire = `${FICHIER}.tmp`;
  writeFileSync(temporaire, `${JSON.stringify(comptes, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaire, FICHIER);
}

const sb = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Connexion d'abord, pour que le script puisse être relancé sans réinscrire le compte
const connexion = await sb.auth.signInWithPassword({ email, password });
if (connexion.error) {
  const raison = `${connexion.error.code} ${connexion.error.message}`;
  if (!/invalid.?(login|credentials)/i.test(raison)) stop(`Connexion impossible : ${connexion.error.message}`);

  const inscription = await sb.auth.signUp({ email, password });
  if (inscription.error) stop(`Inscription impossible : ${inscription.error.message}`);
  if (!inscription.data.session) stop("Inscription sans session : le compte n'est pas utilisable.");
  log(`Compte créé : ${email}`);
} else {
  log(`Connecté : ${email}`);
}
enregistrer(pseudo);

const profil = await sb.rpc("my_profile");
if (profil.error) stop(`Profil : ${profil.error.message}`);

if (profil.data?.id) {
  enregistrer(profil.data.pseudo);
  log(`Profil déjà créé : ${profil.data.pseudo}`);
} else {
  const creation = await sb.rpc("create_profile", { p_pseudo: pseudo });
  if (creation.error) stop(`Pseudo « ${pseudo} » refusé : ${creation.error.message}`);
  log(`Profil créé : ${pseudo}`);
}

const bot = spawnSync(process.execPath, [join(import.meta.dirname, "..", "bot.mjs"), `--gen=${gen}`], {
  env: { ...process.env, REF_EMAIL: email, REF_PASS: password },
  stdio: "inherit",
});
process.exit(bot.status ?? 1);
