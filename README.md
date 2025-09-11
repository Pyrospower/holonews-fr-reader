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

| Commande | Action |
| :------- | :----- |
| `pnpm install` | Installe les dépendances |
| `pnpm dev` | Lance le serveur de développement |
| `pnpm build` | Génère le site pour la production |
| `pnpm preview` | Prévisualise le build en local |
| `pnpm astro ...` | Exécute les commandes CLI d'Astro |

## 🔧 Technologies utilisées

- Frameworks : **[Astro](https://astro.build)** + **[Svelte](https://svelte.dev)**
- Styles : **[Tailwind CSS](https://tailwindcss.com)** + **[shadcn-svelte](https://shadcn-svelte.com)**
- Scraping (récupération du contenu) : **[Playwright](https://playwright.dev)**

## 📝 Récupération du contenu

Le projet inclut un script automatisé ([`fillContentCollection.ts`](src/scripts/fillContentCollection.ts)) qui :

1. Accède au [subreddit d'HoloNews](https://reddit.com/r/HoloNews) avec Playwright
2. Récupère les posts d'[HoloNews FR](https://www.reddit.com/r/HoloNews/new/?f=flair_name%3A"FR+Issue")
3. Extrait le contenu et les métadonnées
4. Génère automatiquement les fichiers MDX dans `src/content/issues/`

## 🎨 Interface

- **Page d'accueil** : Liste tous les articles avec aperçu et filtrage
- **Pages d'articles** : Affichage complet de chaque numéro avec images

## 🏷 Tags disponibles

- `lite` - Numéros allégés
- `special` - Numéros spéciaux

## 📄 Licence

Ce projet est sous [licence MIT](LICENSE).
