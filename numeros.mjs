// Numéro d'une carte tel que le site l'affiche (« n° 12 »), partagé par les scripts.
//
// Chaque génération repart à 1, dans l'ordre de `n`, en ne comptant que les cartes en
// boosters (active) ; une carte hors boosters n'a pas de numéro (« HS » sur le site).
// Déduit de l'affichage du site : la fonction numberCards de cartes.js n'est pas dans ce dépôt.
//
// `cards` doit contenir id, n, gen et active.

export function numerosSite(cards) {
  const numero = new Map();
  const dernier = new Map(); // génération -> dernier numéro donné
  for (const c of cards.filter((x) => x.active).sort((a, b) => a.n - b.n)) {
    const gen = c.gen || 1;
    const k = (dernier.get(gen) ?? 0) + 1;
    dernier.set(gen, k);
    numero.set(c.id, k);
  }
  return numero;
}
