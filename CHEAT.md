> [!IMPORTANT]
> **Rien de ce qui suit n'enfreint un règlement, puisqu'aucune condition d'utilisation n'a été mise en place.**

# Ce qui vaudrait un bannissement sur Ref Pocket

Ce dépôt automatise le jeu et fait tourner plusieurs comptes pour un seul joueur. Voici ce qu'un administrateur pourrait lui reprocher.

Le site n'affiche ni règlement ni conditions d'utilisation : cette liste suit donc les règles
habituelles des jeux en ligne, qui pourrait valoir un bannissement, mais n'est relié à aucun texte sur Ref Pocket.

## Motifs les plus graves

### 1. Multi-comptes
`projet_secret/creer-compte.mjs` et l'étape 2 de `projet_secret/projet_secret.py` créent des
comptes en série tant que le compte principal n'a pas assez de cartes.  Chaque compte récupère le cadeau de bienvenue : 3 boosters et 200 Kheys.

### 2. Fausses identités
Les comptes utilisent des adresses `@exemple.com`, qui n'appartiennent pas au joueur.
`generer_pseudo` fabrique des pseudos « crédibles » pour ressembler à de vrais joueurs. C'est de
la dissimulation volontaire, ce qui pèse plus lourd que le multi-compte seul.

### 3. Transfert de richesse vers le compte principal
`projet_secret/transferer.mjs` vide les comptes secondaires de leurs cartes et de leurs Kheys.
La contrepartie de 1 K sert uniquement à franchir l'exigence du jeu, qui veut que le receveur
propose quelque chose : l'échange n'a de réciproque que l'apparence.

### 4. Duels arrangés
Dans `duels.mjs`, l'adversaire est un complice qui abandonne aussitôt, ou qui joue exprès au plus
mal en `--mode=jouer`. Son deck est composé en priorité de cartes que le gagnant n'a pas, pour
lui offrir ce qui manque à sa collection.

### 5. Limite quotidienne contournée
Le jeu plafonne les récompenses à 10 duels par jour et par compte. Faire jouer les comptes deux
par deux multiplie ce plafond : environ 400 K par paire et par jour (300 K pour le gagnant, 100 K
pour le perdant), ensuite renvoyés au compte principal.

### 6. Prêt de cartes entre comptes pour pouvoir tricher
`jouer_duels` prête des cartes du principal aux comptes secondaires pour qu'ils aient un deck
valide, puis les reprend. Des comptes qui n'auraient pas pu jouer se retrouvent donc en duel.

### 7. Récompenses d'albums sur les comptes secondaires
L'étape 3 de `projet_secret.py` lance `projet_secret/albums.mjs` sur chaque compte et réclame
toutes les récompenses d'albums disponibles, puis `rapatrier` renvoie les gains au principal.

## Motifs moins graves

### 8. Jeu entièrement automatisé
`bot.mjs`, `ameliore-cartes.mjs`, `vendre.mjs` et `duels.mjs` jouent sans intervention humaine,
sur GitHub Actions et déclenchés par cron-job.org, avec par exemple des boosters ouverts toutes
les heures.

### 9. Utilisation de l'API hors du client officiel
Les scripts appellent directement les fonctions et les tables de la base avec la clé publique
récupérée dans le site, sans passer par l'interface du jeu.

### 10. Collecte des données des autres joueurs
`profils.mjs` lit tous les profils et les garde en local. Aucun e-mail
ni mot de passe n'y figure, et rien n'est publié. Un administrateur pourrait surtout y voir de la
curiosité, et une exposition de colonnes à corriger côté jeu.

### 11. Marché automatisé
`vendre.mjs` publie des annonces, baisse les prix au fil du temps puis défausse les invendus. Ces
offres pèsent sur le marché des vrais joueurs, surtout quand les cartes viennent de comptes
secondaires.

### 12. Limite de connexions atteinte puis contournée
Le serveur a répondu `Request rate limit reached` pendant `rapatrier.yml`. Les pauses entre les
scripts et la réutilisation des sessions (`session.mjs`) ont été ajoutées pour rester sous cette
limite tout en continuant à faire tourner tous les comptes.

### 13. Diffusion publique de l'outil
Le dépôt est public, et son `README.md` explique comment le forker et l'automatiser. N'importe qui
peut donc reproduire tout ça. Une fois `projet_secret/` commité, la méthode multi-comptes est
publique elle aussi, et les logs d'Actions montrent quels pseudos alimentent le compte principal.
