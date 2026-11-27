# HoloNews FR Reader

Un lecteur web moderne pour les articles d'HoloNews traduits en français, construit avec Astro et Svelte.

## 🌟 À propos

HoloNews FR Reader est une application web qui permet de consulter facilement tous les articles d'HoloNews traduits en français. Le contenu, disponible sur Reddit, est présenté dans une interface claire et moderne.

## ✨ Fonctionnalités

- **Navigation intuitive** : Parcourez facilement tous les numéros d'HoloNews FR
- **Interface moderne** : Design réalisé avec Tailwind CSS et shadcn-svelte
- **Filtrage par tags** : Articles classés par type (LITE, Spécial, etc.)
- **Récupération automatique** : Script automatisé pour récupérer les articles depuis Reddit
- **Performance optimisée** : Construit avec Astro pour des performances maximales

## 🛠 Installation

1. **Cloner le repository**

   ```sh
   git clone https://github.com/Pyrospower/holonews-fr-reader.git
   cd holonews-fr-reader
   ```

2. **Installer les dépendances**

   ```sh
   pnpm install
   ```

3. **Lancer le serveur de développement**
   ```sh
   pnpm dev
   ```

L'application sera accessible sur `http://localhost:4321`

## 🧞 Commandes disponibles

| Commande          | Action                            |
| :---------------- | :-------------------------------- |
| `pnpm install`    | Installe les dépendances          |
| `pnpm dev`        | Lance le serveur de développement |
| `pnpm build`      | Génère le site pour la production |
| `pnpm preview`    | Prévisualise le build en local    |
| `pnpm astro ...`  | Exécute les commandes CLI d'Astro |
| `pnpm test`       | Lance les tests unitaires (Bun)   |
| `pnpm ocr ...`    | Génère les transcriptions (OCR)   |
| `pnpm ocr:status` | Affiche l'état des transcriptions |

## 🔧 Technologies utilisées

- Frameworks : **[Astro](https://astro.build)** + **[Svelte](https://svelte.dev)**
- Styles : **[Tailwind CSS](https://tailwindcss.com)** + **[shadcn-svelte](https://shadcn-svelte.com)**
- Scraping (récupération du contenu) : **[Playwright](https://playwright.dev)**

## 📝 Récupération du contenu

Le projet inclut un script automatisé ([`fillContentCollection.ts`](src/scripts/fillContentCollection.ts)) qui :

1. Accède au [subreddit d'HoloNews](https://reddit.com/r/HoloNews) avec Playwright
2. Récupère les posts d'[HoloNews FR](https://www.reddit.com/r/HoloNews/new/?f=flair_name%3A"FR+Issue")
3. Extrait le contenu et les métadonnées
4. Génère automatiquement les fichiers MDX dans `src/data/issues/`

## 🔎 Transcriptions (OCR)

Le texte des pages est extrait par OCR pour pouvoir proposer un mode de lecture « transcription ». L'OCR tourne **uniquement en local**, avec [Tesseract](https://github.com/tesseract-ocr/tesseract) via [tesseract.js](https://github.com/naptha/tesseract.js) : pas de serveur, pas d'API payante, rien au build ni dans le navigateur. Le site ne lit que les fichiers JSON générés, qui sont versionnés dans le repo.

### Lancer l'OCR

Il faut [Bun](https://bun.sh). Le script ([`src/scripts/ocr`](src/scripts/ocr)) s'utilise ainsi :

```sh
# Une seule page (numérotée à partir de 1, dans l'ordre du numéro)
pnpm ocr --issue holonews_fr_ver_1306_-_1906 --page 3

# Un numéro entier
pnpm ocr --issue holonews_fr_ver_1306_-_1906

# Tous les numéros
pnpm ocr --all
```

L'identifiant d'un numéro est celui qu'Astro utilise dans l'URL (`/issues/<id>`) : le nom du fichier `.mdx` sans extension et sans ponctuation (points, apostrophes…). Avec un identifiant inconnu, le script affiche la liste des identifiants.

Au premier lancement, le script télécharge les modèles français et anglais (`tessdata_best`, dans la version entière fournie par tesseract.js, environ 6 Mo) puis les images en pleine résolution depuis Reddit. Tout est mis en cache dans `.cache/ocr/` (ignoré par git, environ 3 Go pour tous les numéros). Compter 2 à 6 secondes par page une fois les images téléchargées.

Relancer le script ne refait pas le travail inutilement : une page déjà transcrite est ignorée, sauf si le pipeline a évolué depuis (pages au statut `auto` uniquement).

### Statuts

Chaque page donne un fichier `src/data/transcriptions/<id>/<page>.json`, chargé par la collection `transcriptions` (voir [`src/transcriptions.ts`](src/transcriptions.ts) pour le format exact).

| Statut        | Signification                                                                                        |
| :------------ | :--------------------------------------------------------------------------------------------------- |
| `auto`        | Transcription brute de l'OCR, non relue                                                              |
| `corrected`   | Transcription relue et corrigée à la main                                                            |
| `unavailable` | Pas de transcription exploitable (presque pas de texte, ou confiance trop faible), à ne pas afficher |

Une page `corrected` ou `unavailable` n'est **jamais** écrasée par le script, sauf avec `--force` (à utiliser avec `--page` pour ne pas perdre de corrections).

```sh
pnpm ocr:status
```

affiche, pour chaque numéro, le nombre de pages `auto` / `corrected` / `unavailable` / manquantes, les numéros les moins fiables en premier, puis la liste des pages `auto` qui ont la plus faible confiance (à relire en priorité).

### Corriger une transcription à la main

Ouvrez le fichier JSON de la page et modifiez directement les `blocks` :

- corrigez le `text` d'un bloc (les éléments de liste sont sur leur propre ligne, précédés de `•`) ;
- supprimez les blocs parasites, réordonnez-les (l'ordre des blocs est l'ordre de lecture) ;
- changez le `type` d'un bloc : `heading` (titre), `paragraph` ou `other` (légende, texte dans une image…) ;
- ajoutez un bloc manquant : `{ "type": "heading", "text": "..." }` (la `bbox` est facultative).

Passez ensuite `status` à `"corrected"`. Pour masquer une page dont la transcription est inutilisable, passez-la à `"unavailable"`.

### Pages animées (GIF)

Pour les pages GIF, l'OCR est fait sur une seule image de l'animation, celle du milieu par défaut. Si le texte y est mal lu (artwork animé par-dessus, par exemple), choisissez une autre image dans [`src/scripts/ocr/frameOverrides.json`](src/scripts/ocr/frameOverrides.json) :

```json
{ "holonews_fr_ver_2211_-_2811/1": 0 }
```

puis relancez la page : une page `auto` est régénérée automatiquement si son image change.

### Limites connues

- Les couvertures ne sont que partiellement transcrites : les titres posés sur l'illustration (avec ombre portée) sont souvent manqués.
- L'ordre de lecture suit les colonnes (de gauche à droite, de haut en bas) : sur les mises en page en zigzag ou en grille, il peut différer de l'ordre voulu.
- Le texte japonais et le texte dans les illustrations sont ignorés ou filtrés.

## 🔍 Recherche

La page [`/search`](src/pages/search.astro) cherche dans le texte de toutes les pages transcrites. Tout se passe dans le navigateur : pas de serveur, pas de base de données.

- Au build, Astro génère [`/search-index.json`](src/pages/search-index.json.ts) : une entrée par page transcrite (numéro, titre, date, page, texte), sans les pages `unavailable`. Le fichier est téléchargé uniquement en ouvrant la page de recherche, qui construit alors l'index avec [MiniSearch](https://github.com/lucaong/minisearch).
- La recherche ignore les accents et les majuscules (`ecole` trouve « École », `coeur` trouve « cœur »), cherche le début des mots pendant la frappe, exige tous les mots de la requête et tolère une faute de frappe dans les mots de 5 lettres ou plus (deux à partir de 8), en classant les correspondances exactes en premier.
- La requête est dans l'URL (`/search?q=...`) et chaque résultat ouvre le lecteur sur la bonne page (`/issues/<id>?page=N&q=...`). Le lecteur surligne alors les mots trouvés dans la transcription, encadre les blocs correspondants sur l'image et propose un champ « Rechercher dans ce numéro » pour passer d'une page trouvée à l'autre (Entrée / Maj+Entrée).

Les règles de recherche et de surlignage sont dans [`src/search.ts`](src/search.ts), testées dans [`src/search.test.ts`](src/search.test.ts).

## 🎤 Talents

La page [`/talents`](src/pages/talents/index.astro) liste les talents cités dans les transcriptions, par branche et par génération, et chaque talent a sa page (`/talents/<slug>`) avec un extrait de chaque page qui le mentionne. Le lecteur affiche aussi, sous chaque page, les talents qu'elle mentionne.

Les mentions sont repérées **au build**, sans IA : on cherche dans le texte les noms d'un dictionnaire versionné, [`src/data/talents.json`](src/data/talents.json). Le code ([`src/talents.ts`](src/talents.ts), testé dans [`src/talents.test.ts`](src/talents.test.ts)) ne part pas dans le navigateur : les pages reçoivent seulement le résultat.

Pour chaque talent, le dictionnaire donne :

- `slug` : l'identifiant stable utilisé dans l'URL, à ne pas changer ;
- `name` : le nom affiché, aussi cherché dans le texte ;
- `aliases` : les autres noms (prénom, surnoms, autres orthographes), cherchés sans tenir compte des majuscules ni des accents (`Pekora` trouve « Pékora » et « PEKORA ») ;
- `casedAliases` : les noms qui sont aussi des mots courants ou d'autres noms (`Reine`, `Marine`, `Lui`, `Ame`, `Noel`…), cherchés seulement avec la même casse et les mêmes accents, ou tout en majuscules (`Reine` trouve « REINE » mais pas « reine », `Ame` ne trouve pas « âme »).

Un nom n'est trouvé que comme mot entier (`Mel` ne trouve pas « Melfissa »), y compris après une élision ou avant un possessif (« l'Iroha », « Ina's »). La liste `ignore` contient des expressions qui contiennent un nom sans parler du talent (titres de chansons comme « Kira Kira », « Reine des Erreurs ») : elles sont écartées avant la recherche des noms.

Pour ajouter un talent, ajoutez une entrée dans la bonne génération ; pour ajouter un surnom, complétez `aliases` (ou `casedAliases` si c'est aussi un mot courant). Lancez ensuite `pnpm test`, puis vérifiez dans le texte que le nouveau nom ne trouve pas de fausses mentions (par exemple avec la recherche du site, qui elle ignore la casse). Un talent sans aucune mention n'apparaît pas sur le site.

## 🔊 Lecture à voix haute

Dans les modes Mixte et Texte, la barre de la transcription propose de lire la page à voix haute (lecture, pause, arrêt et vitesse de 0,75× à 1,5×, mémorisée dans le navigateur). Tout passe par la synthèse vocale du navigateur ([Web Speech API](https://developer.mozilla.org/fr/docs/Web/API/SpeechSynthesis)) : pas de bibliothèque, pas de serveur. Les boutons n'apparaissent pas si le navigateur ne la propose pas.

- Les blocs sont lus dans l'ordre, découpés en morceaux d'au plus 200 caractères aux fins de phrase (certains navigateurs coupent ou bloquent sur les textes longs). Les emoji et symboles décoratifs, puces et séparateurs ne sont pas lus.
- La voix suit la langue de la page (`lang` de la transcription : `fr-FR` ou `en-US`), en préférant une voix installée sur l'appareil. S'il n'y en a aucune pour cette langue, la page est lue avec la voix par défaut et le lecteur le signale.
- Le bloc lu est encadré dans le texte (et sur l'image en mode Mixte), et ramené à l'écran s'il en sort. Pendant la lecture, cliquer sur un bloc reprend la lecture à partir de lui (sauf si le clic termine une sélection de texte).
- La lecture s'arrête en changeant de page, en passant en mode Original ou en quittant la page ; elle continue en passant de Mixte à Texte. La pause arrête la phrase en cours et la reprise la relit depuis son début, ce qui évite les blocages de Chrome après une longue pause.

Le découpage, le nettoyage du texte et le choix de la voix sont dans [`src/speech.ts`](src/speech.ts), le lecteur dans [`src/speechPlayer.ts`](src/speechPlayer.ts), tous deux testés.

## 🎨 Interface

- **Page d'accueil** : Liste tous les articles avec aperçu et filtrage
- **Pages d'articles** : Affichage complet de chaque numéro avec images
- **Recherche** : Recherche dans le texte de toutes les pages, avec surlignage dans le lecteur
- **Talents** : Les talents mentionnés dans les numéros, avec les pages qui les citent
- **Modes de lecture** : Original (image seule), Mixte (image et transcription côte à côte) et Texte (transcription seule), avec copie du texte, taille de texte réglable et lecture à voix haute. Le mode et la taille sont mémorisés dans le navigateur, et la page courante est dans l'URL (`?page=N`)

## 🏷 Tags disponibles

- `lite` - Numéros allégés
- `special` - Numéros spéciaux

## 📄 Licence

Ce projet est sous [licence MIT](LICENSE).
