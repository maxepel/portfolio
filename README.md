# Portfolio

A static portfolio page for four projects: Content Finder, Canvas Widget,
Questboard (Node Maps), and Disneyland Papercraft. Each one has something you
can try on the page.

**Live page:** https://maxepel.github.io/portfolio/

The site is everything in [`demos/`](demos/), with [`demos/index.html`](demos/index.html)
as the entry. [`.github/workflows/pages.yml`](.github/workflows/pages.yml) deploys
it to GitHub Pages on every push to `main`.

## Disneyland Papercraft download

The game is built with Godot 4.7 from a separate repository and published as
release files here:

- [Windows](https://github.com/maxepel/portfolio/releases/latest/download/Disneyland-Papercraft-Windows.zip)
- [Mac](https://github.com/maxepel/portfolio/releases/latest/download/Disneyland-Papercraft-Mac.zip)

Each zip has only the game: no Godot install needed.

## Run locally

```bash
npx http-server demos -p 8137 -c-1
```

Then open http://localhost:8137.

## Credits

Third-party fonts, models, audio, and libraries are credited in the `CREDITS`
and `LICENSE` files next to them in `demos/`.
