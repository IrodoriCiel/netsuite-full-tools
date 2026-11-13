<p align="center">
  <img src="assets/icons/icon128.png" alt="NSFT logo" width="96" height="96">
</p>

<h1 align="center">NetSuite Full Tools (NSFT)</h1>

<p align="center"><b>+100 herramientas para NetSuite: SuiteQL, IA, modo oscuro, File Cabinet, copiar IDs, atajos y más. Todo local. Trabaja más rápido.</b><br><i>100+ tools for NetSuite: SuiteQL, AI, dark mode, File Cabinet, copy IDs, shortcuts & more. All local. Get more done, faster.</i></p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/netsuite-full-tools/fgldkomofdfcmkccjgalihlollndjmcc"><img alt="Versión en la Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/fgldkomofdfcmkccjgalihlollndjmcc?style=for-the-badge&logo=googlechrome&logoColor=white&label=Chrome%20Web%20Store&color=4285F4"></a>
  <a href="https://chromewebstore.google.com/detail/netsuite-full-tools/fgldkomofdfcmkccjgalihlollndjmcc"><img alt="Usuarios" src="https://img.shields.io/chrome-web-store/users/fgldkomofdfcmkccjgalihlollndjmcc?style=for-the-badge&color=2C6E4E&label=Usuarios"></a>
  <a href="https://chromewebstore.google.com/detail/netsuite-full-tools/fgldkomofdfcmkccjgalihlollndjmcc"><img alt="Valoración" src="https://img.shields.io/chrome-web-store/rating/fgldkomofdfcmkccjgalihlollndjmcc?style=for-the-badge&color=F59E0B&label=Rating"></a>
</p>
<p align="center">
  <a href="#relación-con-el-paquete-de-la-store--relation-to-the-store-package"><img alt="Versión de este espejo" src="https://img.shields.io/badge/Espejo%20·%20Mirror-v8.0.0-555555?style=for-the-badge"></a>
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-2C6E4E?style=for-the-badge&logo=googlechrome&logoColor=white"></a>
  <a href="#ficha-técnica--technical-details"><img alt="JavaScript sin frameworks" src="https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black"></a>
  <a href="#ficha-técnica--technical-details"><img alt="Sin telemetría ni servidores propios" src="https://img.shields.io/badge/Privacidad-100%25%20local-2C6E4E?style=for-the-badge"></a>
  <a href="#ficha-técnica--technical-details"><img alt="Español e inglés" src="https://img.shields.io/badge/ES%20·%20EN-i18n-6E7CF5?style=for-the-badge"></a>
  <a href="https://irodoriciel.github.io/nsft-tablero/"><img alt="Tablero público: estado de los errores reportados y las mejoras pedidas" src="https://img.shields.io/badge/Tablero%20·%20Board-bugs%20y%20mejoras-1A73E8?style=for-the-badge"></a>
</p>

<p align="center"><a href="https://chromewebstore.google.com/detail/netsuite-full-tools/fgldkomofdfcmkccjgalihlollndjmcc">Chrome Web Store</a> · <a href="https://netsuitefulltools.com/">netsuitefulltools.com</a> · <a href="https://irodoriciel.github.io/nsft-tablero/">Tablero de avance / Progress board</a> · <a href="https://chromewebstore.google.com/detail/netsuite-full-tools/fgldkomofdfcmkccjgalihlollndjmcc/support">Soporte / Support</a></p>

---


## Qué es este repositorio · About this repository

Este repositorio contiene el código de la extensión **tal como se publica en la Chrome Web Store**, en versión legible (sin minificar) y sin comentarios, para que cualquiera pueda revisar qué hace. Es un **espejo de solo lectura**: el desarrollo ocurre en un repositorio privado y este espejo se regenera automáticamente con cada versión.

This repository mirrors the extension **exactly as published on the Chrome Web Store**, in readable (unminified) form so anyone can review what it does. It is a **read-only mirror**: development happens in a private repository and this mirror is regenerated on every release.

## Funciones · Features

Más de 100 herramientas para NetSuite: SuiteQL Runner, Asistente de IA, Editor Avanzado, modo oscuro, File Cabinet, copiar IDs, atajos de teclado y más, dentro de las pantallas que ya usas. Corre en tu navegador, sin servidores propios.

<details>
<summary><b>📦 Catálogo completo (español)</b></summary>

</details>

<details>
<summary><b>📦 Full catalog (English)</b></summary>

</details>

## Relación con el paquete de la Store · Relation to the Store package

El ZIP que se distribuye en la Chrome Web Store es **este mismo código pasado por minificación**, sin ninguna otra transformación:

The ZIP distributed on the Chrome Web Store is **this same code run through minification**, with no other transformation:

| Tipo | Herramienta · Tool | Qué hace · What it does |
|---|---|---|
| JS | [esbuild](https://esbuild.github.io/) (`minify`, target `chrome100`) | Espacios, renombrado de variables locales y compresión de sintaxis · Whitespace, local-variable mangling, syntax compression |
| CSS | [clean-css](https://github.com/clean-css/clean-css) | Minificación de estilos · Stylesheet minification |
| HTML | [html-minifier-terser](https://github.com/terser/html-minifier-terser) | Colapso de espacios y minificado del JS/CSS incrustado · Whitespace collapse, embedded JS/CSS minification |
| Libs de terceros | — | Idénticas en ambos: van tal cual las distribuyen sus autores · Identical in both |

Las únicas diferencias entre este repositorio y el paquete publicado son **esa minificación** y que aquí se eliminaron los comentarios. Al generar este espejo se verifica **byte a byte** que minificar cada archivo de este repositorio produce el mismo resultado que el build publicado — la equivalencia funcional no es una promesa, es una comprobación automática de cada versión.

The only differences between this repository and the published package are **that minification** and the removal of comments. When this mirror is generated, it is verified **byte-for-byte** that minifying each file here produces the same output as the published build — functional equivalence is not a promise, it is an automated check on every release.

## Firefox

`node tools/firefox/build.mjs` genera `dist/firefox/` y un ZIP listo para [addons.mozilla.org](https://addons.mozilla.org/developers/). Para probarlo: `about:debugging` → *Este Firefox* → *Cargar complemento temporal* → `dist/firefox/manifest.json`. Requiere Firefox 140+. El panel lateral de Chrome no existe en Firefox; esas vistas se abren dentro de la página. Contribución de [iyari-fiesco](https://github.com/iyari-fiesco) ([PR #2](https://github.com/IrodoriCiel/netsuite-full-tools/pull/2)).

`node tools/firefox/build.mjs` builds `dist/firefox/` and a ZIP ready for [addons.mozilla.org](https://addons.mozilla.org/developers/). To try it: `about:debugging` → *This Firefox* → *Load Temporary Add-on* → `dist/firefox/manifest.json`. Requires Firefox 140+. Chrome's side panel doesn't exist in Firefox; those views open inside the page instead. Contributed by [iyari-fiesco](https://github.com/iyari-fiesco) ([PR #2](https://github.com/IrodoriCiel/netsuite-full-tools/pull/2)).

## Ficha técnica · Technical details

| | |
|---|---|
| Plataforma | Chrome **Manifest V3** (service worker, sin código remoto / no remote code) |
| Ámbito / Scope | Solo dominios de NetSuite: `*.netsuite.com`, `*.app.netsuite.com` |
| Datos / Data | Todo local (`chrome.storage`). Sin telemetría, sin analytics, sin servidores propios / No telemetry, no analytics, no own servers |
| Asistente de IA / AI assistant | Opcional y **con tu propia clave** (BYO key: Anthropic, OpenAI, Gemini, Ollama…). Solo envía lo que tú le pides / Optional, bring-your-own-key; only sends what you ask |
| Idiomas / Languages | Español · English (`_locales/`) |

### Permisos · Permissions

| Permiso | Para qué · Purpose |
|---|---|
| `storage` + `unlimitedStorage` | Preferencias y cachés locales (esquemas SuiteQL, historiales) · Local preferences and caches |
| `clipboardWrite` | Copiar IDs, rutas y resultados con un clic · One-click copy of IDs, paths and results |
| `tabGroups` | Agrupar pestañas por cuenta y entorno · Group tabs by account & environment |

### Librerías de terceros · Third-party libraries (`scripts/libs/`)

Van minificadas porque así las distribuyen sus autores · Shipped minified as their authors distribute them.

| Librería | Uso · Use |
|---|---|
| CodeMirror | Editor SQL con resaltado y autocompletado · SQL editor |
| Tabulator | Tabla de resultados de SuiteQL · Results grid |
| Chart.js | Gráficas de resultados · Result charts |
| highlight.js | Resaltado de código y temas del editor · Syntax highlighting |
| sql-formatter | Formateo de consultas · Query formatting |
| PapaParse | Lectura/edición de CSV · CSV parsing |

### Estructura · Layout

| Carpeta | Contenido · Contents |
|---|---|
| `scripts/modules/` | Un módulo por herramienta; cada uno es un content script independiente · One self-contained module per tool |
| `scripts/modules/_shared/` | Base común: observer, portapapeles, tokens de diseño, defaults · Shared foundation |
| `scripts/background.js` | Service worker: agrupación de pestañas, distintivo de entorno, puente de IA · Service worker |
| `popup/` | Popup de configuración (todas las herramientas se activan una a una) · Settings popup |
| `_locales/` | Textos ES/EN · UI strings |

## Probarlo en local · Try it locally

1. Descarga o clona este repositorio · Download or clone this repo.
2. `chrome://extensions` → activa **Modo de desarrollador** · enable **Developer mode**.
3. **Cargar descomprimida / Load unpacked** → apunta a esta carpeta · point at this folder.

## Licencia · License

Código **disponible para leer, auditar y compilar en local** — pero NO es open source: queda prohibido redistribuirlo o republicarlo en la Chrome Web Store o cualquier otra tienda. Detalles en [LICENSE](LICENSE).

**Source-available** — you may read, audit and build it locally, but it is NOT open source: redistributing it or republishing it to the Chrome Web Store or any other store is not allowed. See [LICENSE](LICENSE).

---

Espejo generado automáticamente en cada versión · Mirror auto-generated on every release.
Errores y sugerencias · Bugs & suggestions → [soporte de la Store](https://chromewebstore.google.com/detail/netsuite-full-tools/fgldkomofdfcmkccjgalihlollndjmcc/support).
Estado de lo reportado · Track what you reported → [Tablero · Board](https://irodoriciel.github.io/nsft-tablero/).
