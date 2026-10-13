# Facturas — Electricidad

Aplicación web sencilla para hacer facturas. **No necesita cuenta de Google ni de nada**: se abre en el navegador
(ordenador o móvil) y funciona incluso sin conexión.

- Factura con el mismo formato que la de papel: Albarán, Artículo, Unidades, Precio, % Dto., Precio Dto., Total;
  Total bruto, I.V.A., Rec. Equiv.; forma de pago, banco y vencimiento.
- Logo en la factura (se puede cambiar en *Mis datos*).
- Numeración automática y correlativa por año (sigue desde el número que le digas).
- I.V.A. 21% / 10%, recargo de equivalencia y retención IRPF opcionales.
- Lista de clientes, duplicar facturas, y resumen por trimestre con descarga para el gestor (Excel/CSV).
- Imprimir o guardar en PDF desde el botón **Imprimir / Guardar PDF**.

## Dónde se guardan los datos

**Solo en el navegador del dispositivo donde se usa** (no se suben a ningún sitio, tampoco a GitHub).
Por eso:

- Usarlo siempre en el **mismo dispositivo y navegador**.
- En *Mis datos → Descargar copia* se baja un archivo `.json` con todo. Hay que hacerlo de vez en cuando
  (la propia aplicación avisa) y guardarlo en el correo o en un USB.
- Con *Restaurar copia* se recupera todo, o se pasa a otro ordenador o al móvil.
- No usarlo en modo incógnito, y no borrar los "datos de sitios" del navegador.

## Publicarlo (GitHub Pages)

1. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   rama `main`, carpeta `/ (root)` → **Save**.
2. A los 1–2 minutos estará en `https://<usuario>.github.io/<repositorio>/`.

> GitHub Pages en repositorios **privados** solo funciona con GitHub Pro. Con cuenta gratuita, el repositorio tiene
> que ser **público**. No pasa nada: en el código no hay ningún dato personal, todo se escribe en la aplicación.

En el móvil: abrir la dirección y en el menú del navegador **"Añadir a pantalla de inicio"**; queda como una app.

## Primer uso

1. *Mis datos*: nombre, NIF, nº de instalador, dirección, teléfono, IBAN y **primer nº de factura del año**
   (si ya llevas 17 facturas este año, pon 18).
2. *Nueva factura*: fecha, cliente, líneas → **Guardar factura** → **Imprimir / Guardar PDF**.

Para mandar la factura por WhatsApp o email: guardarla como PDF y adjuntarla.

## Avisos

- Una factura guardada no se modifica. Solo se puede borrar la última (por si te acabas de equivocar).
  Si ya se entregó al cliente, lo correcto es hacer una **factura rectificativa** con importes en negativo.
- **VeriFactu**: cuando entre en vigor para autónomos (prevista para julio de 2027), las facturas hechas con programa
  tendrán que hacerse con un programa adaptado. Esta aplicación no lo está; para entonces habrá que pasar a la
  aplicación gratuita de la Agencia Tributaria o a un programa homologado.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html`, `styles.css`, `app.js` | la aplicación |
| `logo.svg` | logo por defecto |
| `icon*.png`, `icon.svg`, `manifest.webmanifest`, `sw.js` | icono, instalación en el móvil y uso sin conexión |
