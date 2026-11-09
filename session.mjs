// Connexion à Ref Pocket, partagée par les scripts.
//
// Si REF_SESSIONS indique un fichier, la session de chaque compte y est gardée et réutilisée
// par les scripts suivants : le serveur limite le nombre de connexions par mot de passe.
// Ce fichier contient des jetons d'accès : il ne doit jamais être commité ni affiché.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

const URL = "https://driraijgakhmnsxepuot.supabase.co";
const KEY = "sb_publishable_BgXnR1FLTcLLajt3id9q_A_RI6JAw1N";
const OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } };
const MARGE_S = 600; // une session qui expire bientôt ne survivrait pas à un long script

const { REF_SESSIONS } = process.env;

function lireSessions() {
  if (!REF_SESSIONS) return {};
  try {
    return JSON.parse(readFileSync(REF_SESSIONS, "utf8"));
  } catch {
    return {}; // pas encore de fichier, ou fichier illisible : on se reconnecte
  }
}

function enregistrerSession(cle, session) {
  const sessions = lireSessions();
  sessions[cle] = { access_token: session.access_token, expires_at: session.expires_at };
  const temporaire = `${REF_SESSIONS}.tmp`;
  writeFileSync(temporaire, JSON.stringify(sessions), { mode: 0o600 });
  renameSync(temporaire, REF_SESSIONS);
}

// Renvoie { sb, error } : sb est un client connecté à ce compte
export async function ouvrirSession(email, password) {
  const cle = email.trim().toLowerCase();
  const connue = lireSessions()[cle];
  if (connue?.expires_at > Date.now() / 1000 + MARGE_S) {
    const global = { headers: { Authorization: `Bearer ${connue.access_token}` } };
    return { sb: createClient(URL, KEY, { ...OPTIONS, global }), error: null };
  }

  const sb = createClient(URL, KEY, OPTIONS);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (!error && REF_SESSIONS) enregistrerSession(cle, data.session);
  return { sb, error };
}
