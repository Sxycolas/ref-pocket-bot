import { connecter } from "./session.mjs";

const { REF_EMAIL, REF_PASS } = process.env;

if (!REF_EMAIL || !REF_PASS) throw new Error("REF_EMAIL / REF_PASS manquants");

// Facultatif : --gen=1 ou --gen=2 n'ouvre que cette génération.
// Sans « -- » après le nom du script, npm garde l'option pour lui et la passe en npm_config_gen.
// Un « --gen 2 » mal écrit arrête le script : sinon les boosters iraient à une autre génération.
const genArg = process.argv.find((a) => a.startsWith("--gen")) ??
  (process.env.npm_config_gen && `--gen=${process.env.npm_config_gen}`);
const GEN = genArg ? Number(genArg.split("=")[1]) : null;
if (GEN !== null && GEN !== 1 && GEN !== 2) throw new Error("--gen attend 1 ou 2 (ex. --gen=2)");

const log = (...a) => console.log(new Date().toISOString(), ...a);

// Un compte sans profil (pseudo pas encore choisi) s'arrête ici, pas sur une erreur plus loin
const { sb, me: p, error } = await connecter(REF_EMAIL, REF_PASS);
if (error) {
  log(error);
  process.exit(1);
}

const REFILL_MS = 3600e3;
const MAX_STOCK = 2;

// Même calcul que le site : au-delà de la réserve max, le stock n'est pas plafonné
let gratuits =
  p.boosters >= MAX_STOCK
    ? p.boosters
    : Math.min(
        MAX_STOCK,
        p.boosters + Math.floor((Date.now() - new Date(p.last_refill)) / REFILL_MS),
      );
const achetes = (gen) => (gen === 2 ? p.bought2 : p.bought1) || 0;
log(`Stock estimé : ${gratuits} gratuit(s), ${achetes(2)} acheté(s) Gén. 2, ${achetes(1)} acheté(s) Gén. 1`);

let gens = [GEN];
if (GEN === null) {
  // Comme le site : une génération n'est ouverte que si chaque rareté y a une carte publiée
  const g2 = await sb.from("cards").select("rarity").eq("gen", 2).eq("active", true);
  if (g2.error) log("Catalogue Gén. 2 illisible :", g2.error.message);
  const gen2Prete = !g2.error && ["L", "E", "R", "C"].every((r) => g2.data.some((c) => c.rarity === r));

  // Les boosters gratuits servent pour les deux générations : ils vont à la Gén. 2.
  // Les boosters achetés sont réservés à leur génération : ceux de Gén. 1 s'ouvrent ensuite.
  gens = gen2Prete ? [2, 1] : [1];
}

// Le serveur reste juge : on ouvre jusqu'à ce qu'il refuse (garde-fou à 100)
let opened = 0;
for (const gen of gens) {
  const attendu = gratuits + achetes(gen);
  if (gen !== gens[0] && attendu === 0) continue; // évite un appel qui serait forcément refusé

  let ouverts = 0;
  while (opened < 100) {
    const r = await sb.rpc("open_booster", gen === 2 ? { p_paid: false, p_gen: 2 } : { p_paid: false });
    if (r.error) {
      log(ouverts >= attendu ? `Plus de booster Gén. ${gen} disponible.` : `Gén. ${gen} refusée : ${r.error.message}`);
      break;
    }
    ouverts++;
    opened++;
    log(
      `Booster Gén. ${gen} ouvert : ${r.data.length} cartes, ${r.data.filter((x) => x.is_new).length} nouvelles`,
    );
  }
  // Si le serveur refuse la Gén. 2 avant la fin, les gratuits restants vont à la Gén. 1
  gratuits = Math.max(0, attendu - ouverts - achetes(gen));
}
log(`${opened} booster${opened > 1 ? "s" : ""} ouvert${opened > 1 ? "s" : ""}.`);
