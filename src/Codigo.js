/**
 * FACTURAS — Google Sheets + Apps Script
 * Plantilla de facturación sencilla para un autónomo (electricista).
 *
 * Hojas que crea:
 *   - Datos     → datos fijos del autónomo (se rellenan una vez)
 *   - Clientes  → agenda de clientes
 *   - Factura   → la factura que se rellena e imprime
 *   - Registro  → libro de facturas emitidas (para los trimestres)
 *
 * Menú "Facturas":
 *   1. Configurar (solo la primera vez)
 *   2. Nueva factura          → limpia la plantilla y pone número y fecha
 *   3. Guardar factura en PDF → crea el PDF en Drive y lo apunta en el Registro
 *   4. Enviar última factura por email
 */

// ---------- Constantes de la plantilla ----------
const HOJA = { DATOS: 'Datos', CLIENTES: 'Clientes', FACTURA: 'Factura', REGISTRO: 'Registro' };

const CELDA = {
  NUMERO: 'E1',
  FECHA: 'E2',
  CLIENTE: 'D4',
  IVA_PCT: 'C27',
  RET_PCT: 'C28',
  BASE: 'E26',
  CUOTA_IVA: 'E27',
  RETENCION: 'E28',
  TOTAL: 'E29',
  OBSERVACIONES: 'A33',
};
const PRIMERA_LINEA = 10;
const ULTIMA_LINEA = 24;
const RANGO_IMPRESION = 'A1:E35';
const CARPETA_RAIZ = 'Facturas';
const EURO = '#,##0.00 "€"';

// ---------- Menú ----------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Facturas')
    .addItem('Nueva factura', 'nuevaFactura')
    .addItem('Guardar factura en PDF', 'guardarFactura')
    .addItem('Enviar última factura por email', 'enviarUltimaFactura')
    .addSeparator()
    .addItem('Configurar (solo la primera vez)', 'configurar')
    .addToUi();
}

// ---------- Configuración inicial ----------
function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  ss.setSpreadsheetLocale('es_ES');
  ss.setSpreadsheetTimeZone('Europe/Madrid');

  crearHojaDatos_(ss);
  crearHojaClientes_(ss);
  crearHojaRegistro_(ss);

  let factura = ss.getSheetByName(HOJA.FACTURA);
  if (factura) {
    const r = ui.alert('La hoja "Factura" ya existe. ¿Quieres volver a crearla? (se borra lo que tenga escrito)',
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
    ss.deleteSheet(factura);
  }
  crearHojaFactura_(ss);

  const hojaVacia = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hojaVacia && ss.getSheets().length > 1) ss.deleteSheet(hojaVacia);

  ss.setActiveSheet(ss.getSheetByName(HOJA.DATOS));
  ui.alert('Listo. Rellena la hoja "Datos" con tus datos y añade clientes en "Clientes".\n' +
    'Después usa el menú Facturas → Nueva factura.');
}

function crearHojaDatos_(ss) {
  if (ss.getSheetByName(HOJA.DATOS)) return;
  const sh = ss.insertSheet(HOJA.DATOS);
  const filas = [
    ['Nombre y apellidos / nombre comercial', ''],
    ['NIF', ''],
    ['Dirección', ''],
    ['CP y localidad', ''],
    ['Teléfono', ''],
    ['Email', ''],
    ['IBAN (para cobrar por transferencia)', ''],
    ['Serie de las facturas (opcional, ej. "A")', ''],
    ['IVA por defecto', 0.21],
    ['Retención IRPF por defecto (0% o 1% si estás en módulos)', 0],
    ['Texto al pie de la factura', 'Gracias por su confianza.'],
  ];
  sh.getRange(1, 1, filas.length, 2).setValues(filas);
  sh.getRange('A1:A' + filas.length).setFontWeight('bold').setBackground('#f1f3f4');
  sh.getRange('B9:B10').setNumberFormat('0%');
  sh.setColumnWidth(1, 380);
  sh.setColumnWidth(2, 320);
}

function crearHojaClientes_(ss) {
  if (ss.getSheetByName(HOJA.CLIENTES)) return;
  const sh = ss.insertSheet(HOJA.CLIENTES);
  sh.getRange('A1:E1').setValues([['Nombre', 'NIF', 'Dirección', 'CP y localidad', 'Email']])
    .setFontWeight('bold').setBackground('#f1f3f4');
  sh.setFrozenRows(1);
  [220, 110, 260, 180, 220].forEach((w, i) => sh.setColumnWidth(i + 1, w));
}

function crearHojaRegistro_(ss) {
  if (ss.getSheetByName(HOJA.REGISTRO)) return;
  const sh = ss.insertSheet(HOJA.REGISTRO);
  sh.getRange('A1:L1').setValues([[
    'Nº factura', 'Fecha', 'Trimestre', 'Cliente', 'NIF cliente', 'Base imponible',
    'IVA %', 'Cuota IVA', 'Retención', 'Total', 'PDF', 'Enviada a',
  ]]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.setFrozenRows(1);
  sh.getRange('B:B').setNumberFormat('dd/mm/yyyy');
  sh.getRange('F:F').setNumberFormat(EURO);
  sh.getRange('G:G').setNumberFormat('0%');
  sh.getRange('H:J').setNumberFormat(EURO);
  sh.getRange('A1:L1').setNumberFormat('@'); // cabecera como texto
  sh.getRange('A:A').setNumberFormat('@');   // los números de factura son texto
}

function crearHojaFactura_(ss) {
  const sh = ss.insertSheet(HOJA.FACTURA, 0);
  sh.setHiddenGridlines(true);
  [260, 110, 80, 150, 130].forEach((w, i) => sh.setColumnWidth(i + 1, w));

  // Cabecera
  sh.getRange('A1').setValue('FACTURA').setFontSize(22).setFontWeight('bold');
  sh.getRange('D1').setValue('Nº factura:').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('D2').setValue('Fecha:').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange(CELDA.NUMERO).setNumberFormat('@').setHorizontalAlignment('right');
  sh.getRange(CELDA.FECHA).setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('right');

  // Emisor
  sh.getRange('A3').setFormula('=Datos!B1').setFontWeight('bold');
  sh.getRange('A4').setFormula('="NIF: "&Datos!B2');
  sh.getRange('A5').setFormula('=Datos!B3');
  sh.getRange('A6').setFormula('=Datos!B4');
  sh.getRange('A7').setFormula('=TRIM(IF(Datos!B5="","","Tel. "&Datos!B5)&"   "&Datos!B6)');

  // Cliente
  sh.getRange('D3').setValue('CLIENTE').setFontWeight('bold');
  sh.getRange('D4:E4').merge().setBackground('#fff8e1');
  sh.getRange('D5').setFormula('=IF(D4="","",IFERROR("NIF: "&VLOOKUP(D4,Clientes!A:E,2,FALSE),""))');
  sh.getRange('D6').setFormula('=IF(D4="","",IFERROR(VLOOKUP(D4,Clientes!A:E,3,FALSE),""))');
  sh.getRange('D7').setFormula('=IF(D4="","",IFERROR(VLOOKUP(D4,Clientes!A:E,4,FALSE),""))');
  const reglaCliente = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName(HOJA.CLIENTES).getRange('A2:A'), true)
    .setAllowInvalid(false)
    .setHelpText('Elige un cliente de la hoja "Clientes"')
    .build();
  sh.getRange(CELDA.CLIENTE).setDataValidation(reglaCliente);

  // Líneas
  sh.getRange('A9:E9').setValues([['Concepto', 'Tipo', 'Cantidad', 'Precio unidad', 'Importe']])
    .setFontWeight('bold').setBackground('#263238').setFontColor('#ffffff');
  const nLineas = ULTIMA_LINEA - PRIMERA_LINEA + 1;
  const formulas = [];
  for (let f = PRIMERA_LINEA; f <= ULTIMA_LINEA; f++) {
    formulas.push([`=IF(OR(C${f}="",D${f}=""),"",ROUND(C${f}*D${f},2))`]);
  }
  sh.getRange(PRIMERA_LINEA, 5, nLineas, 1).setFormulas(formulas);
  sh.getRange(PRIMERA_LINEA, 1, nLineas, 4).setBackground('#fff8e1');
  sh.getRange(PRIMERA_LINEA, 4, nLineas, 2).setNumberFormat(EURO);
  sh.getRange(PRIMERA_LINEA, 3, nLineas, 1).setNumberFormat('0.##');
  const reglaTipo = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Mano de obra', 'Material', 'Desplazamiento'], true).build();
  sh.getRange(PRIMERA_LINEA, 2, nLineas, 1).setDataValidation(reglaTipo);
  sh.getRange(9, 1, nLineas + 1, 5)
    .setBorder(true, true, true, true, false, true, '#b0bec5', SpreadsheetApp.BorderStyle.SOLID);

  // Totales
  sh.getRange('D26:D29').setValues([['Base imponible'], ['IVA'], ['Retención IRPF'], ['TOTAL']])
    .setHorizontalAlignment('right');
  sh.getRange(CELDA.BASE).setFormula(`=SUM(E${PRIMERA_LINEA}:E${ULTIMA_LINEA})`);
  sh.getRange(CELDA.CUOTA_IVA).setFormula('=ROUND(E26*C27,2)');
  sh.getRange(CELDA.RETENCION).setFormula('=-ROUND(E26*C28,2)');
  sh.getRange(CELDA.TOTAL).setFormula('=E26+E27+E28');
  sh.getRange('E26:E29').setNumberFormat(EURO);
  sh.getRange('C27:C28').setNumberFormat('0%').setBackground('#fff8e1');
  sh.getRange(CELDA.IVA_PCT).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['21%', '10%'], true).build());
  sh.getRange(CELDA.RET_PCT).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['0%', '1%', '7%', '15%'], true).build());
  sh.getRange('D29:E29').setFontWeight('bold').setFontSize(13)
    .setBorder(true, null, null, null, null, null, '#263238', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Pie
  sh.getRange('A31').setFormula('=IF(Datos!B7="","","Forma de pago: transferencia bancaria a "&Datos!B7)');
  sh.getRange('A32').setValue('Observaciones:').setFontWeight('bold');
  sh.getRange('A33:E33').merge().setBackground('#fff8e1').setWrap(true);
  sh.getRange('A35').setFormula('=Datos!B11').setFontStyle('italic').setFontColor('#607d8b');

  sh.getRange('A1:E35').setFontFamily('Arial');
  sh.getRange('A1').setFontSize(22);
  limpiarFactura_(sh);
}

// ---------- Nueva factura ----------
function nuevaFactura() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = hoja_(HOJA.FACTURA);
  limpiarFactura_(sh);
  const hoy = new Date();
  sh.getRange(CELDA.NUMERO).setValue(siguienteNumero_(hoy));
  sh.getRange(CELDA.FECHA).setValue(hoy);
  ss.setActiveSheet(sh);
  sh.setActiveRange(sh.getRange(CELDA.CLIENTE));
}

function limpiarFactura_(sh) {
  const datos = hoja_(HOJA.DATOS);
  const nLineas = ULTIMA_LINEA - PRIMERA_LINEA + 1;
  sh.getRange(PRIMERA_LINEA, 1, nLineas, 4).clearContent();
  sh.getRange(CELDA.CLIENTE).clearContent();
  sh.getRange(CELDA.OBSERVACIONES).clearContent();
  sh.getRange(CELDA.NUMERO).clearContent();
  sh.getRange(CELDA.FECHA).clearContent();
  sh.getRange(CELDA.IVA_PCT).setValue(datos.getRange('B9').getValue() || 0.21);
  sh.getRange(CELDA.RET_PCT).setValue(datos.getRange('B10').getValue() || 0);
}

/** Numeración correlativa por año: [SERIE]AAAA-001, AAAA-002… Se calcula a partir del Registro. */
function siguienteNumero_(fecha) {
  const serie = String(hoja_(HOJA.DATOS).getRange('B8').getValue() || '').trim();
  const prefijo = serie + fecha.getFullYear() + '-';
  const reg = hoja_(HOJA.REGISTRO);
  let max = 0;
  if (reg.getLastRow() > 1) {
    reg.getRange(2, 1, reg.getLastRow() - 1, 1).getValues().forEach(([n]) => {
      n = String(n);
      if (n.startsWith(prefijo)) max = Math.max(max, parseInt(n.slice(prefijo.length), 10) || 0);
    });
  }
  return prefijo + String(max + 1).padStart(3, '0');
}

// ---------- Guardar factura ----------
function guardarFactura() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = hoja_(HOJA.FACTURA);
  SpreadsheetApp.flush();

  const numero = String(sh.getRange(CELDA.NUMERO).getValue()).trim();
  const fecha = sh.getRange(CELDA.FECHA).getValue();
  const cliente = String(sh.getRange(CELDA.CLIENTE).getValue()).trim();
  const base = sh.getRange(CELDA.BASE).getValue();

  // Comprobaciones
  const errores = [];
  if (!hoja_(HOJA.DATOS).getRange('B1').getValue() || !hoja_(HOJA.DATOS).getRange('B2').getValue())
    errores.push('Faltan tu nombre o NIF en la hoja "Datos".');
  if (!numero) errores.push('Falta el número de factura (usa "Nueva factura").');
  if (!(fecha instanceof Date)) errores.push('Falta la fecha.');
  if (!cliente) errores.push('Falta elegir el cliente.');
  if (!(base > 0)) errores.push('No hay ninguna línea con cantidad y precio.');
  if (numeroYaRegistrado_(numero)) errores.push(`La factura ${numero} ya está guardada. Pulsa "Nueva factura".`);
  if (errores.length) { ui.alert('No se puede guardar:\n\n• ' + errores.join('\n• ')); return; }

  const cli = buscarCliente_(cliente);
  if (!cli.nif && base * (1 + sh.getRange(CELDA.IVA_PCT).getValue()) > 400) {
    const r = ui.alert('El cliente no tiene NIF y la factura pasa de 400 €. ' +
      'Una factura completa debe llevar el NIF del cliente. ¿Guardar de todas formas?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }

  // PDF en Drive: Facturas/AAAA/
  const pdf = exportarPdf_(ss, sh).setName(`Factura ${numero} - ${cliente}.pdf`);
  const carpeta = carpetaAnio_(fecha.getFullYear());
  const archivo = carpeta.createFile(pdf);

  // Registro
  const trimestre = `${fecha.getFullYear()}-T${Math.floor(fecha.getMonth() / 3) + 1}`;
  hoja_(HOJA.REGISTRO).appendRow([
    numero, fecha, trimestre, cliente, cli.nif || '', base,
    sh.getRange(CELDA.IVA_PCT).getValue(), sh.getRange(CELDA.CUOTA_IVA).getValue(),
    sh.getRange(CELDA.RETENCION).getValue(), sh.getRange(CELDA.TOTAL).getValue(),
    archivo.getUrl(), '',
  ]);

  // Deja una nota en el número para saber que esta factura ya está guardada
  sh.getRange(CELDA.NUMERO).setNote('Guardada el ' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm'));

  if (cli.email) {
    const r = ui.alert(`Factura ${numero} guardada en Drive.\n\n¿Enviarla ahora por email a ${cli.email}?`, ui.ButtonSet.YES_NO);
    if (r === ui.Button.YES) enviarPorEmail_(numero, cli.email, archivo);
  } else {
    ui.alert(`Factura ${numero} guardada en Drive (carpeta ${CARPETA_RAIZ}/${fecha.getFullYear()}).`);
  }
}

function exportarPdf_(ss, sh) {
  const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export` +
    `?format=pdf&gid=${sh.getSheetId()}&range=${encodeURIComponent(RANGO_IMPRESION)}` +
    '&size=A4&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false' +
    '&pagenum=UNDEFINED&top_margin=0.6&bottom_margin=0.6&left_margin=0.6&right_margin=0.6';
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) throw new Error('No se pudo crear el PDF (código ' + resp.getResponseCode() + ')');
  return resp.getBlob();
}

// ---------- Email ----------
function enviarUltimaFactura() {
  const ui = SpreadsheetApp.getUi();
  const reg = hoja_(HOJA.REGISTRO);
  if (reg.getLastRow() < 2) { ui.alert('Todavía no hay facturas guardadas.'); return; }
  const fila = reg.getRange(reg.getLastRow(), 1, 1, 12).getValues()[0];
  const [numero, , , cliente] = fila;
  const url = fila[10];
  const cli = buscarCliente_(cliente);
  let email = cli.email;
  if (!email) {
    const r = ui.prompt(`El cliente "${cliente}" no tiene email. Escríbelo:`, ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return;
    email = r.getResponseText().trim();
  }
  const id = String(url).match(/[-\w]{25,}/);
  if (!id) { ui.alert('No encuentro el PDF de la factura ' + numero); return; }
  enviarPorEmail_(numero, email, DriveApp.getFileById(id[0]));
}

function enviarPorEmail_(numero, email, archivo) {
  const datos = hoja_(HOJA.DATOS);
  const nombre = datos.getRange('B1').getValue();
  MailApp.sendEmail({
    to: email,
    subject: `Factura ${numero} - ${nombre}`,
    body: `Buenos días:\n\nLe adjunto la factura ${numero}.\n\nUn saludo,\n${nombre}\n${datos.getRange('B5').getValue()}`,
    name: nombre,
    attachments: [archivo.getAs(MimeType.PDF)],
  });
  // Apunta en el Registro a quién se envió
  const reg = hoja_(HOJA.REGISTRO);
  const numeros = reg.getRange(1, 1, reg.getLastRow(), 1).getValues().map(r => String(r[0]));
  const i = numeros.indexOf(String(numero));
  if (i > 0) reg.getRange(i + 1, 12).setValue(email + ' (' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy') + ')');
  SpreadsheetApp.getUi().alert(`Factura ${numero} enviada a ${email}.`);
}

// ---------- Utilidades ----------
function hoja_(nombre) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!sh) throw new Error(`Falta la hoja "${nombre}". Usa Facturas → Configurar.`);
  return sh;
}

function numeroYaRegistrado_(numero) {
  const reg = hoja_(HOJA.REGISTRO);
  if (reg.getLastRow() < 2) return false;
  return reg.getRange(2, 1, reg.getLastRow() - 1, 1).getValues().some(([n]) => String(n) === numero);
}

function buscarCliente_(nombre) {
  const sh = hoja_(HOJA.CLIENTES);
  if (sh.getLastRow() < 2) return {};
  const fila = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues()
    .find(r => String(r[0]).trim() === String(nombre).trim());
  return fila ? { nombre: fila[0], nif: fila[1], direccion: fila[2], cp: fila[3], email: fila[4] } : {};
}

function carpetaAnio_(anio) {
  const raiz = obtenerOCrear_(DriveApp.getRootFolder(), CARPETA_RAIZ);
  return obtenerOCrear_(raiz, String(anio));
}

function obtenerOCrear_(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}
