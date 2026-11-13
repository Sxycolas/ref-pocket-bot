#!/usr/bin/env python3
"""Entretient le compte principal : boosters, rapatriement, amélioration et défausse des surplus.

    python3 projet_secret/maintenir.py [--dry] [--gen=1|2]

Le compte principal est le premier de compte-auto.json (créé s'il n'y en a aucun). Dans l'ordre :
ouverture des boosters, rapatriement des cartes restées sur les comptes secondaires (après les
avoir fait jouer deux par deux), amélioration des cartes (ameliore-cartes.mjs), puis défausse des
exemplaires en trop des cartes déjà au niveau 5 (defausser.mjs). Avec --dry, rien n'est amélioré
ni défaussé, mais les boosters et le rapatriement ont lieu normalement.
"""

import os
import subprocess
import sys
from itertools import zip_longest

from projet_secret import (
    DOSSIER,
    RACINE,
    _lancer,
    _lire_json,
    creer_compte,
    generer_pseudo,
    lire_comptes,
    ouvrir_boosters,
    rapatrier,
)


def choisir_gen(email, password):
    """Renvoie la génération dont ouvrir les boosters : 1 ou 2.

    Celle où il manque le plus de doublons pour monter toutes les cartes au niveau max (niveaux.mjs) ;
    à égalité, la 2, la plus récente. --gen=1 ou --gen=2 impose le choix.
    """
    for argument in sys.argv[1:]:
        if argument in ("--gen=1", "--gen=2"):
            return int(argument[-1])
    manque = {int(g): infos["manque"] for g, infos in _lire_json("niveaux.mjs", email, password).items()}
    gen = 1 if manque[1] > manque[2] else 2
    print(f"Doublons manquants pour le niveau max : Gén. 1 : {manque[1]}, Gén. 2 : {manque[2]} -> boosters de Gén. {gen}.")
    return gen


def ameliorer(email, password, dry=False):
    """Améliore toutes les cartes du compte qui peuvent l'être (compte rendu dans ameliorations.md).

    Lève CalledProcessError si le script échoue.
    """
    commande = ["node", str(RACINE / "ameliore-cartes.mjs")]
    if dry:
        commande.append("--dry")
    _lancer(commande, cwd=RACINE, env={**os.environ, "REF_EMAIL": email, "REF_PASS": password})


def defausser_surplus(email, password, dry=False):
    """Défausse les exemplaires en surplus des cartes au niveau maximum.

    Lève CalledProcessError si le script échoue.
    """
    commande = [
        "node",
        str(DOSSIER / "defausser.mjs"),
        f"--email={email}",
        f"--password={password}",
    ]
    if dry:
        commande.append("--dry")
    _lancer(commande)


if __name__ == "__main__":
    dry = "--dry" in sys.argv[1:]

    ## Reprendre les comptes déjà créés, sinon créer le compte principal

    joueurs = lire_comptes()

    if not joueurs:
        try:
            pseudo = generer_pseudo()
            email, password, pseudo = creer_compte(f"{pseudo.lower()}@exemple.com", pseudo)
            joueurs.append({"email": email, "password": password, "pseudo": pseudo})
        except subprocess.CalledProcessError as erreur:
            sys.exit(erreur.returncode)

    principal = joueurs[0]
    email_principal, password_principal = principal["email"], principal["password"]
    print("Compte principal :", principal["pseudo"], "| comptes repris :", len(joueurs), "(dry)" if dry else "")

    try:
        gen = choisir_gen(email_principal, password_principal)
        ouvrir_boosters(email_principal, password_principal, gen)

        # Rapatrie ce qui serait resté sur les comptes secondaires lors d'une exécution coupée,
        # après les avoir fait jouer deux par deux. En nombre impair, le dernier joue contre l'avant-dernier.
        secondaires = joueurs[1:]
        if len(secondaires) % 2 and len(secondaires) > 1:
            secondaires.append(secondaires[-2])
        for joueur, adversaire in zip_longest(secondaires[::2], secondaires[1::2]):
            rapatrier(joueur, principal, gen, adversaire)

        print("Amélioration des cartes...")
        ameliorer(email_principal, password_principal, dry)
        print("Défausse des surplus au niveau max...")
        defausser_surplus(email_principal, password_principal, dry)
    except subprocess.CalledProcessError as erreur:
        sys.exit(erreur.returncode)
