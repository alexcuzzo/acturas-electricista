# Facturas — Electricidad

Aplicación web sencilla para hacer facturas. **No necesita cuenta de nada**: se abre en el navegador
(móvil u ordenador) y funciona incluso sin conexión.

- La factura sale igual que la de papel (Albarán, Artículo, Unidades, Precio, % Dto., Total; I.V.A., Rec. Equiv.;
  forma de pago, banco y vencimiento), con el logo.
- Numeración automática y correlativa por año.
- Al escribir el cliente o un material que ya se usó, se rellenan solos sus datos y su último precio.
- Lista de facturas por trimestre, con descarga para el gestor (se abre en Excel).
- **Imprimir / PDF** para imprimirla o guardarla y mandarla por WhatsApp o email.

## Dónde se guardan los datos

**Solo en el aparato y navegador donde se usa** (no se suben a ningún sitio, tampoco a GitHub). Por eso:

- Usarlo siempre en el **mismo aparato y navegador**.
- En *Mis datos → Hacer copia* se guarda todo en un archivo. Hacerlo de vez en cuando (la aplicación avisa) y
  mandárselo al correo. En el móvil se abre directamente "Compartir".
- Con *Recuperar copia* se recupera todo, o se pasa a otro aparato.
- No usarlo en modo incógnito ni borrar los "datos de sitios" del navegador.

## Publicarlo (GitHub Pages)

1. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   rama `main`, carpeta `/ (root)` → **Save**.
2. A los 1–2 minutos estará en `https://<usuario>.github.io/<repositorio>/`.

> GitHub Pages en repositorios **privados** solo funciona con GitHub Pro. Con cuenta gratuita, el repositorio tiene
> que ser **público**. No pasa nada: en el código no hay ningún dato personal, todo se escribe en la aplicación.

En el móvil: abrir la dirección y en el menú del navegador **"Añadir a pantalla de inicio"**; queda como una app.

## Primer uso

1. *Mis datos*: nombre, NIF, nº de instalador, dirección, teléfono, IBAN y **nº de la próxima factura**
   (si la última fue la 17, pon 18). O, si tienes un archivo de copia, *Recuperar copia*.
2. *Nueva*: cliente y líneas → **Guardar factura** → **Imprimir / PDF**.

En iPhone, para imprimir o sacar el PDF, abrirla desde Safari.

## Avisos

- Una factura guardada no se modifica. Solo se puede borrar la última (por si te acabas de equivocar).
  Si ya se entregó al cliente, lo correcto es hacer una **factura rectificativa** con importes en negativo
  (botón *Hacer otra igual* y poner los precios en negativo).
- **VeriFactu**: cuando entre en vigor para autónomos (prevista para julio de 2027), las facturas hechas con programa
  tendrán que hacerse con un programa adaptado. Esta aplicación no lo está; para entonces habrá que pasar a la
  aplicación gratuita de la Agencia Tributaria o a un programa homologado.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html`, `styles.css`, `app.js` | la aplicación |
| `logo.svg` | logo por defecto |
| `icon*.png`, `icon.svg`, `manifest.webmanifest`, `sw.js` | icono, instalación en el móvil y uso sin conexión |
