# ref-pocket-bot

> [!WARNING]
> **Ce code a été entièrement fait par Claude et Copilot**, pour voir leur capacité à
> faire un petit projet de A à Z et pour m'entraîner sur la gestion d'agents IA. Le but
> étant aussi de répondre à un petit besoin que j'avais (une automatisation). **Seul le
> README a été relu, le reste est susceptible d'avoir des erreurs.**
> Si le créateur du jeu passe par là, n'hésite pas à visiter [cette page](CHEAT.md).

Petits scripts d'automatisation pour **Ref Pocket**, le jeu de cartes à collectionner.
Chaque script se connecte à **ton** compte (via l'API Supabase du jeu, exactement comme
l'appli) et fait une tâche : ouvrir les boosters, améliorer les cartes, lister ce
qui te manque, lister tes doublons, vendre tes doublons inutiles, auditer ce que la base
expose.

> ⚠️ Ces scripts agissent sur **ton** compte avec **tes** identifiants. Ils
> n'utilisent que les fonctions publiques du jeu (mêmes droits qu'un joueur normal
> dans l'appli) : rien n'est « piraté », tout passe par les règles du serveur.

## Pour l'utiliser sur ton compte

Le dépôt est prévu pour être **forké** : tu fais ta propre copie, tu y mets tes
identifiants (dans **tes** secrets, jamais dans le code), et tu lances les scripts.

1. **Fork** : en haut à droite de la page GitHub du projet, clique sur **Fork**.
   Tu obtiens `https://github.com/<TON-COMPTE>/ref-pocket-bot`.
2. Ensuite, deux façons de t'en servir :
   - **Automatisé** via GitHub Actions + cron-job.org (recommandé, rien à installer) ;
   - **En local** sur ta machine (section *Utilisation en local*).

Dans tout ce README, remplace `<TON-COMPTE>` par ton nom d'utilisateur GitHub.

> Pas besoin de toucher au code : l'adresse du jeu et la clé publique Supabase sont
> les mêmes pour tout le monde (ce sont celles de l'appli). Seuls **tes identifiants**
> changent, et ils ne vont jamais dans le dépôt.

## Les scripts

| Script | Commande | Ce qu'il fait | Écrit |
|---|---|---|---|
| `bot.mjs` | `npm run bot` | Ouvre les boosters disponibles : la Génération 2 d'abord, puis les boosters achetés réservés à la Génération 1. `npm run bot -- --gen=1` (ou `2`) n'ouvre que cette génération | — |
| `ameliore-cartes.mjs` | `npm run ameliore` | Améliore les cartes qui peuvent l'être, dans les raretés choisies, et explique pourquoi les autres ne le peuvent pas | `ameliorations.md` |
| `cartes-manquantes.mjs` | `npm run manquantes` | Liste les cartes du catalogue que tu n'as pas. Si un compte bot est configuré, signale celles qu'il possède et qu'il peut te transférer | `cartes-manquantes.md` |
| `doublons.mjs` | `npm run doublons` | Liste toutes tes cartes en plusieurs exemplaires (total, holos, simples) | `doublons.md` |
| `vendre.mjs` | `npm run vendre` | Met en vente à prix réduit les holos en double et les doublons des cartes au niveau max, baisse le prix de ce qui ne part pas puis le défausse (voir *Vendre les doublons inutiles*) | `ventes.md` |
| `duels.mjs` | `npm run duels` | Joue tes 10 duels récompensés du jour contre ton compte bot (voir *Duels contre ton compte bot*) | `duels.md` |
| `profils.mjs` | `npm run profils` | Audit : ce que la base laisse voir des profils des autres joueurs | `profils.json` |

Les rapports de `cartes-manquantes.mjs` et `doublons.mjs` sont classés par génération, la plus
récente en premier. `ameliore-cartes.mjs` et `vendre.mjs` traitent aussi la Génération 2 en premier.

## Exécution sur GitHub Actions

C'est la façon la plus simple : rien à installer, tout tourne sur les serveurs de
GitHub. Chaque script a un workflow dans [`.github/workflows/`](.github/workflows/).
Ils se lancent **à la main** (bouton « Run workflow » dans l'onglet *Actions*) ou par
un déclencheur externe (voir cron-job.org plus bas). Le résultat s'affiche dans le
résumé du run et se télécharge en artefact.

| Workflow | Fichier |
|---|---|
| Booster horaire | `booster.yml` |
| Amélioration des cartes | `ameliore.yml` |
| Cartes manquantes | `cartes-manquantes.yml` |
| Cartes en doublon | `doublons.yml` |
| Vente des doublons inutiles | `vendre.yml` |
| Duels du jour contre le bot | `duels.yml` |

### 1. Activer les Actions sur ton fork

Sur un dépôt forké, GitHub désactive les workflows par défaut. Va dans l'onglet
**Actions** de ton fork et clique sur **« I understand my workflows, go ahead and
enable them »**.

### 2. Mettre tes identifiants dans les secrets de ton fork

Sur **ton fork** : **Settings → Secrets and variables → Actions → New repository secret**.
Créer **deux** secrets (ne pas les mettre ailleurs, surtout pas dans le code) :

| Nom du secret | Valeur |
|---|---|
| `REF_EMAIL` | ton email Ref Pocket |
| `REF_PASS` | ton mot de passe Ref Pocket (tel quel, **sans** guillemets) |

Les workflows lisent ces secrets via `${{ secrets.REF_EMAIL }}` / `${{ secrets.REF_PASS }}`.

Pour les duels, il faut en plus les secrets d'un compte bot : voir *Rajouter un bot*.

## Automatiser avec cron-job.org (recommandé)

Le `cron:` intégré de GitHub Actions est imprécis (déclenchements souvent reportés
de plusieurs dizaines de minutes, voire sautés). On garde donc les workflows en
**déclenchement manuel** (`workflow_dispatch`) et on les déclenche depuis
l'extérieur avec [cron-job.org](https://cron-job.org), gratuit et ponctuel.

cron-job.org appelle l'API GitHub qui lance le workflow. Il faut un jeton d'accès.

### Étape A — Créer un jeton GitHub (PAT)

Sur **ton** compte GitHub → **Settings → Developer settings → Personal access tokens
→ Fine-grained tokens → Generate new token** :

- **Repository access** : *Only select repositories* → `<TON-COMPTE>/ref-pocket-bot`
- **Permissions → Repository permissions → Actions** : **Read and write**
- Générer et **copier** le jeton (il ne sera plus affiché).

> Avec un token « classic » à la place, il faut les scopes `repo` + `workflow`.

### Étape B — Créer un cronjob par workflow

Dans cron-job.org → **Create cronjob**, pour chaque workflow à automatiser :

- **URL** (remplace `<TON-COMPTE>` et `<FICHIER>` par `ameliore.yml`, `doublons.yml`, etc.) :
  ```
  https://api.github.com/repos/<TON-COMPTE>/ref-pocket-bot/actions/workflows/<FICHIER>/dispatches
  ```
- **Request method** : `POST`
- **Advanced → Headers** :
  | Clé | Valeur |
  |---|---|
  | `Authorization` | `Bearer TON_JETON` |
  | `Accept` | `application/vnd.github+json` |
  | `X-GitHub-Api-Version` | `2022-11-28` |
  | `Content-Type` | `application/json` |
- **Advanced → Request body** :
  ```json
  {"ref":"main"}
  ```
- **Schedule** : l'horaire voulu (ex. tous les jours, ou toutes les heures pour le booster).

Une réponse **HTTP 204** = le workflow a bien été lancé (va voir l'onglet *Actions*).

### Exemple de rythme

| Workflow | Fréquence conseillée |
|---|---|
| `booster.yml` | toutes les heures (les boosters se rechargent avec le temps) |
| `ameliore.yml` | 1×/jour (ou à la main) |
| `doublons.yml` / `cartes-manquantes.yml` | quand tu veux un rapport à jour |
| `vendre.yml` | 1×/jour (la baisse des prix se fait par palier de 24 h) |
| `duels.yml` | 1×/jour, après minuit UTC (le compteur des 10 duels repart à zéro à minuit UTC) |

## Utilisation en local

Si tu préfères lancer les scripts depuis ta machine :

1. **Cloner ton fork** et installer Node 22+ puis les dépendances :
   ```bash
   git clone https://github.com/<TON-COMPTE>/ref-pocket-bot.git
   cd ref-pocket-bot
   npm install
   ```
2. Créer un fichier `.env` à partir du modèle et y mettre tes identifiants Ref Pocket :
   ```bash
   cp .env.example .env
   # puis éditer .env :
   # REF_EMAIL=ton.email@exemple.com
   # REF_PASS=ton_mot_de_passe
   ```
   Le `.env` n'est **jamais** commité (il est dans `.gitignore`). Pour les duels, il faut
   aussi les identifiants d'un compte bot : voir *Rajouter un bot*.
   > Astuce : mets ton mot de passe entre guillemets simples si il contient des
   > caractères spéciaux (ex. `REF_PASS='mon#pass'`).
3. Lancer ce que tu veux, par exemple :
   ```bash
   npm run manquantes
   npm run doublons
   npm run ameliore
   ```

## Rajouter un bot

Le bot est un **second compte Ref Pocket** qui te sert d'adversaire pour les duels
(`duels.mjs`). `cartes-manquantes.mjs` s'en sert aussi, s'il est configuré, pour signaler les
cartes qui te manquent et que le bot peut te transférer. Les autres scripts n'en ont pas besoin.

1. **Créer le compte** : inscris-toi sur Ref Pocket avec une autre adresse email et choisis-lui
   un pseudo. Pas besoin de l'ajouter en ami : `duels.mjs` le fait tout seul.
2. **Donner ses identifiants**, au même endroit que les tiens :
   - **sur GitHub Actions**, deux secrets de plus (**Settings → Secrets and variables →
     Actions → New repository secret**) :

     | Nom du secret | Valeur |
     |---|---|
     | `BOT_EMAIL` | l'email du compte bot |
     | `BOT_PASS` | le mot de passe du compte bot (tel quel, **sans** guillemets) |

   - **en local**, deux lignes de plus dans ton `.env` (le modèle `.env.example` les contient) :
     ```bash
     BOT_EMAIL=email.du.bot@exemple.com
     BOT_PASS='mot_de_passe_du_bot'
     ```
3. **Lui donner des cartes** : il lui faut au moins **6 cartes différentes** pour composer un
   deck, et il en perd une à chaque duel. Rien à faire à la main : dès que les secrets
   `BOT_EMAIL` / `BOT_PASS` existent, `booster.yml` ouvre aussi ses boosters toutes les heures,
   et `duels.yml` les ouvre avant chaque série. En local, donne ses identifiants à `npm run bot`
   (ceux de la ligne de commande passent avant ceux du `.env`) :
   ```bash
   REF_EMAIL='email.du.bot@exemple.com' REF_PASS='mot_de_passe_du_bot' npm run bot
   ```
4. **Vérifier** : `npm run duels -- --dry` (ou *Test à blanc* dans `duels.yml`) connecte les deux
   comptes et affiche les deux decks, sans jouer.

## Choisir les raretés à améliorer

Par défaut, `npm run ameliore` traite toutes les raretés. Pour n'en traiter que certaines :

- **Sur GitHub Actions** : décoche les raretés à ignorer dans le formulaire « Run workflow ».
- **En local** : `npm run ameliore -- --raretes=L,E` (`L` Légendaire, `E` Épique, `R` Rare,
  `C` Commune).
- **Avec cron-job.org** : ajoute les raretés à ignorer dans le corps de la requête, par exemple
  `{"ref":"main","inputs":{"communes":"false"}}`.

Pour n'améliorer qu'une génération, toutes les générations étant traitées par défaut :

- **Sur GitHub Actions** : choisis `1` ou `2` dans « Générations à améliorer » du formulaire « Run workflow ».
- **En local** : `npm run ameliore -- --gen=2`, qui se combine avec `--raretes`.
- **Avec cron-job.org** : `{"ref":"main","inputs":{"generation":"2"}}`.

## Vendre les doublons inutiles

`npm run vendre` met en vente sur le marché du jeu les exemplaires qui ne te servent plus :

- **Les holos en double** : 1 holo est gardée par carte, car elle reste utile en duel (Éclat
  holo : +3 dégâts à la première attaque). Une carte avec 1 holo et des exemplaires normaux
  n'est donc pas touchée.
- **Les cartes au niveau maximum (5)** : tout ce qui dépasse 2 exemplaires, car elles ne
  peuvent plus monter.

Comment ça se passe :

- **Prix** : le prix de référence du jeu moins 20 %, sans descendre sous la valeur de défausse.
  Référence d'une normale : Commune 20 K, Rare 60 K, Épique 200 K, Légendaire 800 K (× 3 pour
  une holo).
- **Une annonce à la fois par carte**, pour varier les offres. Quand elle est vendue, relance
  le script pour mettre en vente l'exemplaire suivant.
- **Baisse progressive** : une annonce restée **24 h** sans acheteur est retirée et remise en
  vente **10 %** du prix de référence moins cher.
- **Défausse** : dès que la baisse atteindrait la valeur de défausse, la carte est **défaussée
  tout de suite** : la vendre à ce prix ne rapporterait pas plus. Les autres exemplaires en
  surplus du même genre (holo ou normale) de cette carte partent avec. Exemple pour une commune
  normale : 16 K → 14 K → 12 K → 10 K → 8 K → 6 K → défaussée (+5 K). Pareil si le prix de
  départ tombe déjà sur la valeur de défausse (remise de 75 % ou plus). `--sans-defausse` ne
  défausse jamais rien : la carte reste en vente au prix plancher.
- **Tes annonces à toi sont respectées** : la baisse ne touche que les annonces de surplus au
  prix de départ du script ou moins cher. Une annonce posée à la main plus cher, ou sur une
  carte qui n'est pas en surplus, n'est jamais modifiée.
- **Tu peux le relancer** : ce qui est déjà en vente ou dans un échange n'est pas touché.

```bash
npm run vendre -- --dry          # affiche ce qui serait vendu, sans rien faire
npm run vendre                   # met en vente pour de vrai
npm run vendre -- --remise=40    # change la remise de départ (entre 1 et 90 %)
npm run vendre -- --baisse=15 --palier=12   # baisse de 15 % toutes les 12 h sans acheteur
npm run vendre -- --sans-defausse           # ne défausse jamais rien
npm run vendre -- --retirer            # retire toutes tes annonces ouvertes
npm run vendre -- --retirer=141,176    # retire seulement ces numéros de carte
npm run vendre -- --retirer --dry      # affiche ce qui serait retiré, sans rien faire
npm run vendre -- --gen=2              # seulement la Génération 2 (ou 1), combinable avec le reste
```

Sur GitHub Actions, le formulaire « Run workflow » de `vendre.yml` propose les mêmes choix :
- **action** : `vendre` (par défaut) ou `retirer` ;
- **generation** : `toutes` (par défaut), `1` ou `2`. Le choix s'applique aux annonces, aux baisses, aux défausses et aux retraits ;
- **remise**, **baisse**, **palier**, **defausser** : les réglages de prix ci-dessus ;
- **cartes** : pour `retirer`, les numéros séparés par des virgules (vide = toutes les annonces).

> ⚠️ Une carte en vente peut être achetée à tout moment par un autre joueur, et seule une annonce
> encore ouverte peut être retirée. `--retirer` sans numéros retire **toutes** tes annonces, même
> celles posées à la main dans l'appli (onglet *Marché*, *Mes ventes*). Une carte retirée mais encore
> en surplus repartira en vente au prochain `npm run vendre` : pense à couper le cron si tu en as un.

> ⚠️ La défausse est **définitive**. Lance d'abord `npm run vendre -- --dry` (ou coche *Test à
> blanc* sur GitHub) pour voir ce qui baisserait et ce qui serait défaussé.

## Duels contre ton compte bot

Chaque duel en ligne rapporte des Kheys : **+30 K** en cas de victoire, **+10 K** en cas de
défaite, dans la limite de **10 duels récompensés par jour** (remis à zéro à minuit UTC).
`npm run duels` les joue pour toi contre un second compte qui te sert d'adversaire :

1. tes deux comptes deviennent amis si ce n'est pas déjà le cas ;
2. ton compte défie le bot avec ton deck le plus fort ;
3. le bot accepte avec un deck composé **en priorité de cartes que tu n'as pas** : le gagnant
   prend une carte au perdant, autant qu'elle complète ta collection ;
4. le bot **abandonne** tout de suite (mode `abandon`, par défaut) : tu gagnes, et tu retournes
   une de ses 6 cartes au hasard. Avec `--mode=jouer`, les deux comptes jouent coup par coup
   (toi au mieux, le bot au plus mal). Si le serveur ne récompense pas un abandon, le script
   passe tout seul en mode `jouer` ;
5. si le bot gagne quand même (mode `jouer`), il ne réclame pas ta carte.

Pour 10 duels gagnés : **+300 K** pour toi, **+100 K** pour le bot, et 10 cartes du bot pour toi.

Il faut d'abord un compte bot : voir *Rajouter un bot* plus haut.

```bash
npm run duels -- --dry          # vérifie les comptes, l'amitié et les decks, sans jouer
npm run duels -- --nombre=1     # un seul duel, pour tester
npm run duels                   # tous les duels récompensés restants du jour
npm run duels -- --mode=jouer   # jouer les coups au lieu de faire abandonner le bot
```
