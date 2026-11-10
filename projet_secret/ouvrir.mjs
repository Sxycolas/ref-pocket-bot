// Ouvre les boosters d'un compte avec bot.mjs.
//
//   npm run ouvrir --email=adresse@exemple.com --password='mot_de_passe' --gen=2
//
// --gen (1 ou 2) est obligatoire : seuls les boosters de cette génération sont ouverts.

import { spawnSync } from "node:child_process";
import { join } from "node:path";

// Sans « -- » après le nom du script, npm garde les options pour lui et les passe en npm_config_*
const option = (nom) =>
  process.argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ??
  process.env[`npm_config_${nom}`];

const email = option("email")?.trim();
const password = option("password");
const gen = option("gen")?.trim();

if (!email || !password || !["1", "2"].includes(gen)) {
  console.log("Indique le compte et la génération : npm run ouvrir --email=adresse@exemple.com --password='mot_de_passe' --gen=2");
  process.exit(1);
}

const bot = spawnSync(process.execPath, [join(import.meta.dirname, "..", "bot.mjs"), `--gen=${gen}`], {
  env: { ...process.env, REF_EMAIL: email, REF_PASS: password },
  stdio: "inherit",
});
process.exit(bot.status ?? 1);
