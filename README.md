# Facturas con Google Sheets

Plantilla de facturación para un autónomo (electricista) hecha con Google Sheets + Apps Script:
numeración automática, cálculo de IVA y retención, PDF en Google Drive, envío por email y libro de facturas emitidas.

```
src/Codigo.js        → el script
src/appsscript.json  → manifiesto (zona horaria y permisos)
```

> Los datos personales (NIF, IBAN, clientes) se escriben en la hoja de cálculo, **nunca en este repositorio**.

## Instalar (una sola vez, 5 minutos, mejor desde el ordenador)

1. Entra en https://sheets.new con la cuenta de Google de tu padre. Ponle de nombre **Facturas**.
2. Menú **Extensiones → Apps Script**.
3. Borra lo que haya en el editor, pega todo el contenido de `src/Codigo.js` y pulsa el disquete (Guardar).
4. Arriba, en el desplegable de funciones, elige **configurar** y pulsa **Ejecutar**.
   - Google pedirá permisos: *Revisar permisos → elegir la cuenta → Configuración avanzada → Ir a Facturas (no seguro) → Permitir*.
     Sale el aviso porque el script lo has hecho tú, no Google; solo accede a esta hoja, a su Drive y para enviar emails desde su Gmail.
5. Vuelve a la hoja y recárgala: aparece el menú **Facturas**.
6. Rellena la hoja **Datos** (nombre, NIF, dirección, IBAN…) y añade clientes en **Clientes**.

## Uso diario

1. **Facturas → Nueva factura**: se pone sola el número (2026-001, 2026-002…) y la fecha de hoy.
2. Elige el cliente en la casilla amarilla y rellena las líneas: concepto, tipo, cantidad y precio.
   Ejemplo: "Cambio de cuadro eléctrico" · Mano de obra · 3 · 35 €.
3. Revisa el IVA (21% o 10% en reparaciones de viviendas de particulares) y la retención (0% normalmente; 1% si está en módulos y el cliente es empresa o autónomo).
4. **Facturas → Guardar factura en PDF**: crea el PDF en Drive (`Facturas/2026/`), lo apunta en **Registro** y pregunta si quieres mandarlo por email al cliente.

La hoja **Registro** tiene la columna *Trimestre*: filtrando por ella sale la lista de facturas para el gestor (modelos 303 y 130/131).

## Desde el móvil

En la app de Google Sheets los menús de los scripts no aparecen. Se puede rellenar la factura en el móvil y luego pulsar "Guardar" desde el ordenador.
Si lo va a usar mucho con el móvil, se puede añadir un botón (casilla de verificación) que lance el guardado.

## Importante

- No borres filas del **Registro**: la numeración se calcula a partir de él y tiene que ser correlativa.
- Si hay que anular una factura, no se borra: se hace una **factura rectificativa** (con importes en negativo) y se apunta en las observaciones a qué factura rectifica.
- **VeriFactu**: a partir de julio de 2027 (fecha prevista para autónomos) los programas de facturación tienen que cumplir VeriFactu, y esta hoja no lo cumple. Hasta entonces sirve; para esa fecha conviene pasarse a la aplicación gratuita de la Agencia Tributaria o a un programa homologado. Las facturas antiguas seguirán en el Registro y en Drive.

## Opcional: subir cambios desde este repositorio con clasp

Para no tener que copiar y pegar cada vez que se cambie el código:

```bash
npm install -g @google/clasp
clasp login
# El ID está en Apps Script → Configuración del proyecto → ID de la secuencia de comandos
clasp clone <ID_DEL_SCRIPT> --rootDir src   # la primera vez (crea .clasp.json, que no se sube a git)
clasp push                                   # sube src/ al proyecto de Apps Script
```
