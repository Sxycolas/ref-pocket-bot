import { ouvrirSession } from "./session.mjs";

const { REF_EMAIL, REF_PASS } = process.env;

if (!REF_EMAIL || !REF_PASS) throw new Error("REF_EMAIL / REF_PASS manquants");

const log = (...a) => console.log(new Date().toISOString(), ...a);

const { sb, error: e0 } = await ouvrirSession(REF_EMAIL, REF_PASS);
if (e0) {
  log("Connexion impossible :", e0.message);
  process.exit(1);
}

const me = await sb.rpc("my_profile");
if (me.error) {
  log("Profil :", me.error.message);
  process.exit(1);
}

const REFILL_MS = 3600e3;
const MAX_STOCK = 2;

// Même calcul que le site : au-delà de la réserve max, le stock n'est pas plafonné
const p = me.data;
const stock =
  p.boosters >= MAX_STOCK
    ? p.boosters
    : Math.min(
        MAX_STOCK,
        p.boosters + Math.floor((Date.now() - new Date(p.last_refill)) / REFILL_MS),
      );
log(`Stock estimé : ${stock}`);

// Le serveur reste juge : on ouvre jusqu'à ce qu'il refuse (garde-fou à 100)
let opened = 0;
while (opened < 100) {
  const r = await sb.rpc("open_booster", { p_paid: false });
  if (r.error) {
    log(opened >= stock ? "Plus de booster disponible." : `Refusé : ${r.error.message}`);
    break;
  }
  opened++;
  log(
    `Booster ouvert : ${r.data.length} cartes, ${r.data.filter((x) => x.is_new).length} nouvelles`,
  );
}
log(`${opened} booster${opened > 1 ? "s" : ""} ouvert${opened > 1 ? "s" : ""}.`);
