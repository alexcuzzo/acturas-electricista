'use strict';
/*
 * Facturas — aplicación web sin servidor.
 * Todo se guarda en el navegador (localStorage). Nada sale del dispositivo.
 */

const CLAVE = 'facturas-electricista-v1';
const LOGO_DEFECTO = 'logo.svg';
const FILAS_MINIMAS = 20; // filas de la tabla en la hoja, como en la factura en papel

// ---------- Utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = n => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(n || 0);
const eur = n => fmt(n) + ' €';
const pct = n => String(n).replace('.', ',') + '%';
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fechaCorta = iso => { if (!iso) return ''; const [a, m, d] = iso.split('-'); return `${d}-${m}-${a.slice(2)}`; };
const fechaLarga = iso => iso ? iso.split('-').reverse().join('/') : '';
const anioDe = iso => parseInt(String(iso).slice(0, 4), 10);
const trimDe = iso => Math.floor((parseInt(String(iso).slice(5, 7), 10) - 1) / 3) + 1;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Datos ----------
const emisorVacio = () => ({
  comercial: '', nombre: '', nif: '', instalador: '', direccion: '', telefono: '', email: '', iban: '',
  formaPago: 'Transferencia bancaria', vencimiento: '', serie: '', primerNumero: 1,
  iva: 21, ret: 0, logo: null, mostrarLogo: true,
});
const dbVacia = () => ({ version: 1, emisor: emisorVacio(), clientes: [], facturas: [], borrador: null, ultimaCopia: null });

let db = cargar();
let almacenamientoOk = true;

function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE));
    if (d && d.emisor) return normalizar(d);
  } catch (e) { /* sin datos o sin acceso */ }
  return dbVacia();
}

function normalizar(d) {
  const base = dbVacia();
  return {
    ...base, ...d,
    emisor: { ...base.emisor, ...d.emisor },
    clientes: Array.isArray(d.clientes) ? d.clientes : [],
    facturas: Array.isArray(d.facturas) ? d.facturas : [],
  };
}

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(db));
    almacenamientoOk = true;
    return true;
  } catch (e) {
    almacenamientoOk = false;
    alert('No se ha podido guardar en este navegador (¿modo incógnito o memoria llena?).\n' +
      'Descarga una copia de seguridad desde "Mis datos" para no perder nada.');
    return false;
  }
}

// Pide al navegador que no borre estos datos para liberar espacio
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- Cálculos ----------
function calcularLinea(l) {
  const uds = num(l.unidades), precio = num(l.precio), dto = num(l.dto);
  const precioDto = dto ? r2(precio * (1 - dto / 100)) : null;
  const total = r2(uds * precio * (1 - dto / 100));
  return { uds, precio, dto, precioDto, total };
}

function calcularTotales(f) {
  const bruto = r2(f.lineas.reduce((s, l) => s + calcularLinea(l).total, 0));
  const cuotaIva = r2(bruto * num(f.iva) / 100);
  const cuotaRe = r2(bruto * num(f.re) / 100);
  const cuotaRet = r2(bruto * num(f.ret) / 100);
  return { bruto, cuotaIva, cuotaRe, cuotaRet, total: r2(bruto + cuotaIva + cuotaRe - cuotaRet) };
}

const lineaVacia = () => ({ albaran: '', concepto: '', unidades: '', precio: '', dto: '' });
const lineaUsada = l => String(l.concepto).trim() || num(l.unidades) || num(l.precio);

function siguienteNumero(anio) {
  const usados = db.facturas.filter(f => f.anio === anio).map(f => f.n);
  return usados.length ? Math.max(...usados) + 1 : Math.max(1, parseInt(db.emisor.primerNumero, 10) || 1);
}
const textoNumero = n => (db.emisor.serie ? db.emisor.serie.trim() : '') + n;

// ---------- Pestañas ----------
function irA(tab) {
  $$('.pestanas button').forEach(b => b.classList.toggle('activa', b.dataset.tab === tab));
  $$('.tab').forEach(s => { s.hidden = s.id !== 'tab-' + tab; });
  if (tab === 'facturas') pintarFacturas();
  if (tab === 'clientes') pintarClientes();
  if (tab === 'datos') pintarDatos();
  if (tab === 'nueva') pintarEditor();
  window.scrollTo(0, 0);
}
$$('.pestanas button').forEach(b => b.addEventListener('click', () => irA(b.dataset.tab)));

// =====================================================================
//  NUEVA FACTURA
// =====================================================================
const fF = $('#f-factura');

function borradorNuevo() {
  const e = db.emisor;
  return {
    fecha: hoyISO(), numero: '', numeroManual: false, clienteId: '',
    cliente: { nombre: '', nif: '', direccion: '', poblacion: '', provincia: '', email: '' },
    guardarCliente: true,
    lineas: [lineaVacia(), lineaVacia(), lineaVacia()],
    iva: e.iva, re: 0, ret: e.ret, formaPago: e.formaPago, vencimiento: e.vencimiento, observaciones: '',
  };
}

function borrador() {
  if (!db.borrador) db.borrador = borradorNuevo();
  return db.borrador;
}

function pintarEditor() {
  const b = borrador();
  if (!b.numeroManual) b.numero = String(siguienteNumero(anioDe(b.fecha)));
  const sel = fF.clienteId;
  sel.innerHTML = '<option value="">— Cliente nuevo —</option>' +
    [...db.clientes].sort((a, c) => a.nombre.localeCompare(c.nombre, 'es'))
      .map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
  fF.fecha.value = b.fecha;
  fF.numero.value = b.numero;
  sel.value = b.clienteId || '';
  for (const k of ['nombre', 'nif', 'direccion', 'poblacion', 'provincia', 'email']) fF['c_' + k].value = b.cliente[k] || '';
  fF.guardarCliente.checked = b.guardarCliente;
  for (const k of ['iva', 're', 'ret']) fF[k].value = String(b[k]);
  for (const k of ['formaPago', 'vencimiento', 'observaciones']) fF[k].value = b[k] || '';
  pintarLineas();
  pintarTotalesEditor();
}

function pintarLineas() {
  const b = borrador();
  $('#lineas').innerHTML = b.lineas.map((l, i) => `
    <div class="linea" data-i="${i}">
      <label class="l-albaran">Albarán <input data-k="albaran" value="${esc(l.albaran)}"></label>
      <label class="l-concepto">Artículo / trabajo <input data-k="concepto" value="${esc(l.concepto)}"></label>
      <label>Unidades <input data-k="unidades" inputmode="decimal" value="${esc(l.unidades)}"></label>
      <label>Precio <input data-k="precio" inputmode="decimal" value="${esc(l.precio)}"></label>
      <label>% Dto. <input data-k="dto" inputmode="decimal" value="${esc(l.dto)}"></label>
      <div class="importe">${eur(calcularLinea(l).total)}</div>
      <button type="button" class="quitar" title="Quitar línea" aria-label="Quitar línea">×</button>
    </div>`).join('');
}

function pintarTotalesEditor() {
  const b = borrador();
  const t = calcularTotales(b);
  $('#totales').innerHTML =
    `<dt>Total bruto</dt><dd>${eur(t.bruto)}</dd>` +
    `<dt>I.V.A. ${pct(b.iva)}</dt><dd>${eur(t.cuotaIva)}</dd>` +
    (num(b.re) ? `<dt>Rec. Equiv. ${pct(b.re)}</dt><dd>${eur(t.cuotaRe)}</dd>` : '') +
    (num(b.ret) ? `<dt>Retención ${pct(b.ret)}</dt><dd>−${eur(t.cuotaRet)}</dd>` : '') +
    `<dt class="total">TOTAL FACTURA</dt><dd class="total">${eur(t.total)}</dd>`;
}

// Cambios en las líneas
$('#lineas').addEventListener('input', ev => {
  const inp = ev.target.closest('input[data-k]');
  if (!inp) return;
  const fila = inp.closest('.linea');
  const l = borrador().lineas[+fila.dataset.i];
  l[inp.dataset.k] = inp.value;
  $('.importe', fila).textContent = eur(calcularLinea(l).total);
  pintarTotalesEditor();
  guardar();
});
$('#lineas').addEventListener('click', ev => {
  if (!ev.target.closest('.quitar')) return;
  const b = borrador();
  b.lineas.splice(+ev.target.closest('.linea').dataset.i, 1);
  if (!b.lineas.length) b.lineas.push(lineaVacia());
  pintarLineas(); pintarTotalesEditor(); guardar();
});
$('#btn-linea').addEventListener('click', () => {
  borrador().lineas.push(lineaVacia());
  pintarLineas(); guardar();
  const filas = $$('#lineas .linea');
  $('input[data-k="concepto"]', filas[filas.length - 1]).focus();
});

// Cambios en el resto del formulario
fF.addEventListener('input', ev => {
  const t = ev.target;
  if (t.closest('#lineas')) return;
  const b = borrador();
  if (t.name === 'fecha') {
    b.fecha = t.value;
    if (!b.numeroManual && t.value) { b.numero = String(siguienteNumero(anioDe(t.value))); fF.numero.value = b.numero; }
  } else if (t.name === 'numero') {
    b.numero = t.value.trim(); b.numeroManual = b.numero !== '';
  } else if (t.name?.startsWith('c_')) {
    b.cliente[t.name.slice(2)] = t.value;
  } else if (t.name === 'guardarCliente') {
    b.guardarCliente = t.checked;
  } else if (['iva', 're', 'ret'].includes(t.name)) {
    b[t.name] = num(t.value); pintarTotalesEditor();
  } else if (['formaPago', 'vencimiento', 'observaciones'].includes(t.name)) {
    b[t.name] = t.value;
  }
  guardar();
});
fF.clienteId.addEventListener('change', () => {
  const b = borrador();
  b.clienteId = fF.clienteId.value;
  const c = db.clientes.find(x => x.id === b.clienteId);
  b.cliente = c ? { nombre: c.nombre, nif: c.nif, direccion: c.direccion, poblacion: c.poblacion, provincia: c.provincia, email: c.email }
    : { nombre: '', nif: '', direccion: '', poblacion: '', provincia: '', email: '' };
  pintarEditor(); guardar();
});

$('#btn-limpiar').addEventListener('click', () => {
  if (!confirm('¿Vaciar la factura que estás escribiendo?')) return;
  db.borrador = borradorNuevo(); guardar(); pintarEditor();
});

$('#btn-vista').addEventListener('click', () => {
  const b = borrador();
  abrirVisor(facturaDesdeBorrador(b, parseInt(b.numero, 10) || siguienteNumero(anioDe(b.fecha))), true);
});

function facturaDesdeBorrador(b, n) {
  const f = {
    id: uid(), anio: anioDe(b.fecha), n, numero: textoNumero(n), fecha: b.fecha,
    cliente: { ...b.cliente },
    lineas: b.lineas.filter(lineaUsada).map(l => ({ ...l })),
    iva: num(b.iva), re: num(b.re), ret: num(b.ret),
    formaPago: b.formaPago || '', vencimiento: b.vencimiento || '', observaciones: b.observaciones || '',
    creada: new Date().toISOString(),
  };
  f.totales = calcularTotales(f);
  return f;
}

fF.addEventListener('submit', ev => {
  ev.preventDefault();
  const b = borrador();
  const e = db.emisor;

  if (!e.nombre.trim() || !e.nif.trim()) {
    alert('Antes de la primera factura rellena tus datos (nombre y NIF) en "Mis datos".');
    irA('datos'); return;
  }
  if (!b.fecha) { alert('Falta la fecha.'); return; }
  if (!b.cliente.nombre.trim()) { alert('Falta el nombre del cliente.'); fF.c_nombre.focus(); return; }
  const usadas = b.lineas.filter(lineaUsada);
  if (!usadas.length) { alert('Añade al menos un artículo o trabajo.'); return; }
  if (usadas.some(l => !String(l.concepto).trim())) { alert('Hay una línea con importe pero sin descripción.'); return; }

  const anio = anioDe(b.fecha);
  const n = parseInt(b.numero, 10) || siguienteNumero(anio);
  if (n < 1) { alert('El número de factura no es válido.'); return; }
  if (db.facturas.some(f => f.anio === anio && f.n === n)) {
    alert(`Ya existe la factura Nº ${textoNumero(n)} de ${anio}. Cambia el número.`); return;
  }
  const anterior = db.facturas.filter(f => f.anio === anio && f.n < n).sort((a, c) => c.n - a.n)[0];
  if (anterior && anterior.fecha > b.fecha &&
    !confirm(`La factura anterior (Nº ${anterior.numero}) tiene fecha ${fechaLarga(anterior.fecha)}, posterior a esta. ` +
      'Las facturas deben ir en orden de fecha. ¿Guardar de todas formas?')) return;
  if (!b.cliente.nif.trim() &&
    !confirm('El cliente no tiene CIF/NIF. Para una factura completa es obligatorio. ¿Guardar de todas formas?')) return;

  const f = facturaDesdeBorrador(b, n);
  if (b.guardarCliente) guardarClienteDesdeFactura(b);
  db.facturas.push(f);
  db.borrador = borradorNuevo();
  if (!guardar()) { db.facturas.pop(); return; }
  pintarEditor();
  abrirVisor(f, false);
});

function guardarClienteDesdeFactura(b) {
  const c = b.cliente;
  let existente = db.clientes.find(x => x.id === b.clienteId)
    || (c.nif.trim() && db.clientes.find(x => x.nif.trim().toUpperCase() === c.nif.trim().toUpperCase()))
    || db.clientes.find(x => x.nombre.trim().toLowerCase() === c.nombre.trim().toLowerCase());
  if (existente) Object.assign(existente, c);
  else db.clientes.push({ id: uid(), ...c });
}

// =====================================================================
//  FACTURAS (registro)
// =====================================================================
const selAnio = $('#filtro-anio'), selTrim = $('#filtro-trim');

function facturasFiltradas() {
  const anio = parseInt(selAnio.value, 10), trim = parseInt(selTrim.value, 10);
  return db.facturas
    .filter(f => f.anio === anio && (!trim || trimDe(f.fecha) === trim))
    .sort((a, c) => c.n - a.n);
}

function pintarFacturas() {
  const anios = [...new Set([new Date().getFullYear(), ...db.facturas.map(f => f.anio)])].sort((a, b) => b - a);
  const actual = selAnio.value || String(anios[0]);
  selAnio.innerHTML = anios.map(a => `<option>${a}</option>`).join('');
  selAnio.value = anios.includes(+actual) ? actual : String(anios[0]);

  const lista = facturasFiltradas();
  const ultimaDelAnio = Math.max(0, ...db.facturas.filter(f => f.anio === +selAnio.value).map(f => f.n));
  $('#lista-facturas').innerHTML = lista.map(f => `
    <tr data-id="${esc(f.id)}">
      <td>${esc(f.numero)}</td><td>${fechaLarga(f.fecha)}</td><td>${esc(f.cliente.nombre)}</td>
      <td class="num">${eur(f.totales.bruto)}</td><td class="num"><b>${eur(f.totales.total)}</b></td>
      <td>
        <button class="secundario mini" data-acc="ver">Ver / imprimir</button>
        <button class="secundario mini" data-acc="duplicar">Duplicar</button>
        ${f.n === ultimaDelAnio ? '<button class="secundario mini peligro" data-acc="borrar">Borrar</button>' : ''}
      </td>
    </tr>`).join('');
  $('#sin-facturas').hidden = lista.length > 0;

  const s = lista.reduce((a, f) => {
    a.bruto += f.totales.bruto; a.iva += f.totales.cuotaIva; a.re += f.totales.cuotaRe;
    a.ret += f.totales.cuotaRet; a.total += f.totales.total; return a;
  }, { bruto: 0, iva: 0, re: 0, ret: 0, total: 0 });
  $('#resumen').innerHTML =
    `<dt>Facturas</dt><dd>${lista.length}</dd>` +
    `<dt>Base imponible</dt><dd>${eur(s.bruto)}</dd>` +
    `<dt>I.V.A. repercutido</dt><dd>${eur(s.iva)}</dd>` +
    (s.re ? `<dt>Recargo de equivalencia</dt><dd>${eur(s.re)}</dd>` : '') +
    (s.ret ? `<dt>Retenciones</dt><dd>${eur(s.ret)}</dd>` : '') +
    `<dt class="total">Total facturado</dt><dd class="total">${eur(s.total)}</dd>`;
}
selAnio.addEventListener('change', pintarFacturas);
selTrim.addEventListener('change', pintarFacturas);

$('#lista-facturas').addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-acc]');
  if (!btn) return;
  const f = db.facturas.find(x => x.id === btn.closest('tr').dataset.id);
  if (!f) return;
  if (btn.dataset.acc === 'ver') abrirVisor(f, false);
  if (btn.dataset.acc === 'duplicar') {
    if (db.borrador && db.borrador.lineas.some(lineaUsada) &&
      !confirm('Se sustituirá la factura que tienes a medias. ¿Seguir?')) return;
    const cli = db.clientes.find(c => c.nif && c.nif === f.cliente.nif) || db.clientes.find(c => c.nombre === f.cliente.nombre);
    db.borrador = {
      ...borradorNuevo(), clienteId: cli ? cli.id : '', cliente: { ...f.cliente },
      lineas: f.lineas.map(l => ({ ...l })), iva: f.iva, re: f.re, ret: f.ret,
      formaPago: f.formaPago, vencimiento: f.vencimiento, observaciones: f.observaciones,
    };
    guardar(); irA('nueva');
  }
  if (btn.dataset.acc === 'borrar') {
    if (!confirm(`¿Borrar la factura Nº ${f.numero}?\n\nHazlo solo si te acabas de equivocar y NO se la has dado al cliente. ` +
      'Si ya la entregaste, lo correcto es hacer una factura rectificativa (con importes en negativo).')) return;
    db.facturas = db.facturas.filter(x => x.id !== f.id);
    guardar(); pintarFacturas();
  }
});

$('#btn-csv').addEventListener('click', () => {
  const lista = facturasFiltradas().reverse();
  if (!lista.length) { alert('No hay facturas en este periodo.'); return; }
  const n = v => fmt(v).replace(/\./g, '');
  const filas = [['Nº factura', 'Fecha', 'Cliente', 'CIF/NIF', 'Base imponible', 'IVA %', 'Cuota IVA', 'Rec. Equiv.', 'Retención', 'Total']]
    .concat(lista.map(f => [f.numero, fechaLarga(f.fecha), f.cliente.nombre, f.cliente.nif, n(f.totales.bruto), String(f.iva).replace('.', ','),
      n(f.totales.cuotaIva), n(f.totales.cuotaRe), n(f.totales.cuotaRet), n(f.totales.total)]));
  const csv = filas.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const periodo = selAnio.value + (selTrim.value ? '-' + selTrim.value + 'T' : '');
  descargar(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `facturas-${periodo}.csv`);
});

// =====================================================================
//  CLIENTES
// =====================================================================
const fC = $('#f-cliente');

function pintarClientes() {
  const lista = [...db.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  $('#lista-clientes').innerHTML = lista.map(c => `
    <tr data-id="${esc(c.id)}">
      <td>${esc(c.nombre)}</td><td>${esc(c.nif)}</td><td>${esc(c.poblacion)}</td>
      <td>
        <button class="secundario mini" data-acc="factura">Hacer factura</button>
        <button class="secundario mini" data-acc="editar">Editar</button>
        <button class="secundario mini peligro" data-acc="borrar">Borrar</button>
      </td>
    </tr>`).join('');
  $('#sin-clientes').hidden = lista.length > 0;
}

fC.addEventListener('submit', ev => {
  ev.preventDefault();
  const datos = Object.fromEntries(['nombre', 'nif', 'direccion', 'poblacion', 'provincia', 'email'].map(k => [k, fC[k].value.trim()]));
  const id = fC.cid.value;
  const c = id && db.clientes.find(x => x.id === id);
  if (c) Object.assign(c, datos); else db.clientes.push({ id: uid(), ...datos });
  guardar(); fC.reset(); pintarClientes();
});
fC.addEventListener('reset', () => { fC.cid.value = ''; $('#titulo-cliente').textContent = 'Nuevo cliente'; });

$('#lista-clientes').addEventListener('click', ev => {
  const btn = ev.target.closest('button[data-acc]');
  if (!btn) return;
  const c = db.clientes.find(x => x.id === btn.closest('tr').dataset.id);
  if (!c) return;
  if (btn.dataset.acc === 'editar') {
    fC.cid.value = c.id;
    for (const k of ['nombre', 'nif', 'direccion', 'poblacion', 'provincia', 'email']) fC[k].value = c[k] || '';
    $('#titulo-cliente').textContent = 'Editar cliente';
    fC.nombre.focus();
  }
  if (btn.dataset.acc === 'borrar' && confirm(`¿Borrar a ${c.nombre} de la lista de clientes?\n(Sus facturas no se borran.)`)) {
    db.clientes = db.clientes.filter(x => x.id !== c.id); guardar(); pintarClientes();
  }
  if (btn.dataset.acc === 'factura') {
    const b = borrador();
    b.clienteId = c.id;
    b.cliente = { nombre: c.nombre, nif: c.nif, direccion: c.direccion, poblacion: c.poblacion, provincia: c.provincia, email: c.email };
    guardar(); irA('nueva');
  }
});

// =====================================================================
//  MIS DATOS
// =====================================================================
const fD = $('#f-datos');
const CAMPOS_EMISOR = ['comercial', 'nombre', 'nif', 'instalador', 'direccion', 'telefono', 'email', 'iban',
  'formaPago', 'vencimiento', 'serie', 'primerNumero', 'iva', 'ret'];

function pintarDatos() {
  const e = db.emisor;
  for (const k of CAMPOS_EMISOR) fD[k].value = e[k] ?? '';
  fD.mostrarLogo.checked = !!e.mostrarLogo;
  $('#logo-preview').src = e.logo || LOGO_DEFECTO;
  $('#info-copia').textContent = db.ultimaCopia
    ? `Última copia descargada: ${new Date(db.ultimaCopia).toLocaleDateString('es-ES')}. Facturas guardadas: ${db.facturas.length}.`
    : `Todavía no has descargado ninguna copia. Facturas guardadas: ${db.facturas.length}.`;
}

fD.addEventListener('submit', ev => {
  ev.preventDefault();
  const e = db.emisor;
  for (const k of CAMPOS_EMISOR) e[k] = fD[k].value.trim();
  e.primerNumero = Math.max(1, parseInt(e.primerNumero, 10) || 1);
  e.iva = num(e.iva); e.ret = num(e.ret);
  e.mostrarLogo = fD.mostrarLogo.checked;
  if (guardar()) alert('Datos guardados.');
});
fD.mostrarLogo.addEventListener('change', () => { db.emisor.mostrarLogo = fD.mostrarLogo.checked; guardar(); });

$('#logo-file').addEventListener('change', ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const lector = new FileReader();
  lector.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Reduce el logo para que ocupe poco espacio
      const escala = Math.min(1, 900 / img.width, 300 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala) || 600; c.height = Math.round(img.height * escala) || 200;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      db.emisor.logo = c.toDataURL('image/png');
      db.emisor.mostrarLogo = true;
      guardar(); pintarDatos();
    };
    img.onerror = () => alert('No se ha podido leer esa imagen.');
    img.src = lector.result;
  };
  lector.readAsDataURL(file);
});
$('#logo-defecto').addEventListener('click', () => { db.emisor.logo = null; guardar(); pintarDatos(); });

// ---------- Copias de seguridad ----------
function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$('#btn-backup').addEventListener('click', () => {
  db.ultimaCopia = new Date().toISOString();
  guardar();
  const copia = { ...db, borrador: null };
  descargar(new Blob([JSON.stringify(copia, null, 1)], { type: 'application/json' }), `facturas-copia-${hoyISO()}.json`);
  pintarDatos(); pintarAviso();
});

$('#restore-file').addEventListener('change', ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  file.text().then(txt => {
    let d;
    try { d = JSON.parse(txt); } catch (e) { alert('Ese archivo no es una copia válida.'); return; }
    if (!d || !d.emisor || !Array.isArray(d.facturas)) { alert('Ese archivo no es una copia válida.'); return; }
    const aviso = db.facturas.length
      ? `Esto SUSTITUYE todo lo que hay ahora (${db.facturas.length} facturas) por la copia (${d.facturas.length} facturas). ¿Seguir?`
      : `¿Cargar la copia (${d.facturas.length} facturas, ${(d.clientes || []).length} clientes)?`;
    if (!confirm(aviso)) return;
    db = normalizar(d);
    db.borrador = null;
    guardar(); pintarDatos(); pintarAviso();
    alert('Copia cargada.');
  });
});

function pintarAviso() {
  const av = $('#aviso');
  const dias = db.ultimaCopia ? (Date.now() - new Date(db.ultimaCopia)) / 864e5 : Infinity;
  const sinCopia = db.facturas.filter(f => !db.ultimaCopia || f.creada > db.ultimaCopia).length;
  if (!db.emisor.nombre) {
    av.innerHTML = 'Bienvenido. Empieza rellenando tus datos. <button class="secundario mini" data-ir="datos">Ir a Mis datos</button>';
  } else if (sinCopia >= 5 || (sinCopia > 0 && dias > 30)) {
    av.innerHTML = `Tienes ${sinCopia} factura(s) sin copia de seguridad. <button class="secundario mini" data-copia>Descargar copia ahora</button>`;
  } else { av.hidden = true; return; }
  av.hidden = false;
}
$('#aviso').addEventListener('click', ev => {
  if (ev.target.closest('[data-ir]')) irA(ev.target.closest('[data-ir]').dataset.ir);
  if (ev.target.closest('[data-copia]')) $('#btn-backup').click();
});

// =====================================================================
//  VISOR E IMPRESIÓN
// =====================================================================
function htmlFactura(f, esBorrador) {
  const e = db.emisor;
  const filas = f.lineas.map(l => {
    const c = calcularLinea(l);
    return `<tr><td class="c">${esc(l.albaran)}</td><td class="c">${esc(l.concepto)}</td>
      <td class="n">${l.unidades === '' ? '' : fmt(c.uds)}</td><td class="n">${l.precio === '' ? '' : fmt(c.precio)}</td>
      <td class="n">${c.dto ? pct(c.dto) : ''}</td><td class="n">${c.precioDto !== null ? fmt(c.precioDto) : ''}</td>
      <td class="n">${fmt(c.total)}</td></tr>`;
  });
  // Una fila vacía arriba, como en la factura en papel, y relleno hasta el mínimo
  filas.unshift('<tr>' + '<td></td>'.repeat(7) + '</tr>');
  while (filas.length < FILAS_MINIMAS) filas.push('<tr>' + '<td></td>'.repeat(7) + '</tr>');
  const t = f.totales;
  const logo = e.mostrarLogo ? `<img src="${esc(e.logo || LOGO_DEFECTO)}" alt="">` : '';

  return `<div class="fx">
    ${esBorrador ? '<div class="fx-borrador">BORRADOR</div>' : ''}
    <div class="fx-cab">
      <div class="fx-emisor">
        ${logo}
        ${e.comercial && !logo ? `<div class="fx-comercial">${esc(e.comercial)}</div>` : ''}
        <div>${esc(e.nombre)}</div>
        <div>N.I.F: ${esc(e.nif)}</div>
        ${e.instalador ? `<div>Instalador autorizado nº ${esc(e.instalador)}</div>` : ''}
        ${e.direccion ? `<div>${esc(e.direccion)}</div>` : ''}
        ${e.telefono ? `<div>Telf: ${esc(e.telefono)}</div>` : ''}
        ${e.email ? `<div>${esc(e.email)}</div>` : ''}
      </div>
      <div class="fx-derecha">
        <table class="fx-cliente">
          <tr><td>Nombre</td><td>${esc(f.cliente.nombre)}</td></tr>
          <tr><td>Dirección</td><td>${esc(f.cliente.direccion)}</td></tr>
          <tr><td>Población</td><td>${esc(f.cliente.poblacion)}</td></tr>
          <tr><td>Provincia</td><td>${esc(f.cliente.provincia)}</td></tr>
          <tr><td>CIF / NIF</td><td>${esc(f.cliente.nif)}</td></tr>
        </table>
        <table class="fx-fechanum">
          <tr><th>FECHA FACTURA</th><th>Nº FACTURA</th></tr>
          <tr><td>${fechaCorta(f.fecha)}</td><td>Nº ${esc(f.numero)}</td></tr>
        </table>
      </div>
    </div>

    <table class="fx-lineas">
      <colgroup><col class="c-alb"><col><col class="c-uni"><col class="c-pre"><col class="c-dto"><col class="c-pdt"><col class="c-tot"></colgroup>
      <thead><tr><th>ALBARAN</th><th>ARTICULO</th><th>UNIDADES</th><th>PRECIO</th><th>%<br>DTO.</th><th>PRECIO<br>DTO.</th><th>TOTAL</th></tr></thead>
      <tbody>${filas.join('')}</tbody>
    </table>

    <div class="fx-bruto"><table><tr><td>TOTAL BRUTO</td><td>${fmt(t.bruto)}</td></tr></table></div>
    <div class="fx-imp"><table>
      <tr><td>I.V.A. %</td><td>${pct(f.iva)}</td><td>${fmt(t.cuotaIva)}</td></tr>
      <tr><td>Rec. Equiv. %</td><td>${f.re ? pct(f.re) : ''}</td><td>${f.re ? fmt(t.cuotaRe) : ''}</td></tr>
      ${f.ret ? `<tr><td>Retención IRPF %</td><td>${pct(f.ret)}</td><td>-${fmt(t.cuotaRet)}</td></tr>` : ''}
    </table></div>

    <div class="fx-total"><span>TOTAL FACTURA</span><span>${eur(t.total)}</span></div>

    <div class="fx-pago">
      <div><b>Forma de pago :</b><span>${esc(f.formaPago)}</span></div>
      <div><b>Banco :</b><span>${esc(e.iban)}</span></div>
      <div><b>Vencimiento :</b><span>${esc(f.vencimiento)}</span></div>
    </div>
    ${f.observaciones ? `<div class="fx-obs"><b>Observaciones:</b> ${esc(f.observaciones)}</div>` : ''}
    <div class="fx-pie"></div>
  </div>`;
}

let tituloOriginal = document.title;
function abrirVisor(f, esBorrador) {
  $('#hoja').innerHTML = htmlFactura(f, esBorrador);
  $('#visor-titulo').textContent = esBorrador ? 'Vista previa (borrador)' : `Factura Nº ${f.numero} — ${f.cliente.nombre}`;
  $('#visor').dataset.nombre = esBorrador ? '' : `Factura ${f.numero} ${f.anio} - ${f.cliente.nombre}`;
  $('#visor').hidden = false;
  document.body.style.overflow = 'hidden';
  history.pushState({ visor: true }, '');
}
function cerrarVisor() {
  $('#visor').hidden = true;
  document.body.style.overflow = '';
  pintarAviso();
}
$('#visor-cerrar').addEventListener('click', () => history.back());
window.addEventListener('popstate', () => { if (!$('#visor').hidden) cerrarVisor(); });
$('#visor-imprimir').addEventListener('click', () => {
  // El título del documento se usa como nombre del PDF
  if ($('#visor').dataset.nombre) document.title = $('#visor').dataset.nombre;
  window.print();
});
window.addEventListener('afterprint', () => { document.title = tituloOriginal; });

// ---------- Arranque ----------
pintarEditor();
pintarAviso();
if (!db.emisor.nombre) irA('datos');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
