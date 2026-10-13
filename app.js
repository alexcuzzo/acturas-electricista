'use strict';
/*
 * Facturas — aplicación web sin servidor.
 * Todo se guarda en el navegador (localStorage). Nada sale del aparato.
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
const fmtNum = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const fmt = n => fmtNum.format(n || 0);
const eur = n => fmt(n) + ' €';
const pct = n => String(n).replace('.', ',') + '%';
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fechaCorta = iso => { if (!iso) return ''; const [a, m, d] = iso.split('-'); return `${d}-${m}-${a.slice(2)}`; };
const fechaLarga = iso => iso ? iso.split('-').reverse().join('/') : '';
const anioDe = iso => parseInt(String(iso).slice(0, 4), 10);
const trimDe = iso => Math.floor((parseInt(String(iso).slice(5, 7), 10) - 1) / 3) + 1;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clave = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
const esMovil = () => matchMedia('(max-width: 760px)').matches;

// ---------- Avisos ----------
let toastTimer;
function aviso(msg, tipo = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'visible ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = tipo; }, tipo === 'error' ? 4500 : 2800);
}
function marcarError(el) {
  if (!el) return;
  el.classList.add('error-campo');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.addEventListener('input', () => el.classList.remove('error-campo'), { once: true });
}

// ---------- Datos ----------
const DATOS_EMISOR = ['comercial', 'nombre', 'nif', 'instalador', 'direccion', 'telefono', 'email', 'iban'];
const emisorVacio = () => ({
  comercial: '', nombre: '', nif: '', instalador: '', direccion: '', telefono: '', email: '', iban: '',
  formaPago: 'Transferencia bancaria', vencimiento: '', serie: '', iva: 21, ret: 0,
  logo: null, mostrarLogo: true, mostrarAlbaranDto: false, siguiente: null,
});
const clienteVacio = () => ({ nombre: '', nif: '', direccion: '', poblacion: '', provincia: '' });
const dbVacia = () => ({ version: 2, emisor: emisorVacio(), clientes: [], facturas: [], borrador: null, ultimaCopia: null });

let db = cargar();

function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE));
    if (d && d.emisor) return normalizar(d);
  } catch (e) { /* sin datos o sin acceso */ }
  return dbVacia();
}

/** Completa campos que falten y adapta datos de versiones anteriores. */
function normalizar(d) {
  const base = dbVacia();
  const out = {
    ...base, ...d, version: 2,
    emisor: { ...base.emisor, ...d.emisor },
    clientes: Array.isArray(d.clientes) ? d.clientes : [],
    facturas: Array.isArray(d.facturas) ? d.facturas : [],
  };
  const e = out.emisor;
  // Versión 1: "primer número del año" → "próxima factura" del año actual
  if (e.primerNumero !== undefined) {
    if (!e.siguiente && parseInt(e.primerNumero, 10) > 1) e.siguiente = { anio: new Date().getFullYear(), n: parseInt(e.primerNumero, 10) };
    delete e.primerNumero;
  }
  const b = out.borrador;
  if (b && 'numeroManual' in b) { if (!b.numeroManual) b.numero = ''; delete b.numeroManual; delete b.clienteId; delete b.guardarCliente; }
  return out;
}

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(db));
    return true;
  } catch (e) {
    aviso('No se ha podido guardar en este navegador. Haz una copia en "Mis datos".', 'error');
    return false;
  }
}

// Pide al navegador que no borre estos datos para liberar espacio
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- Cálculos ----------
function calcularLinea(l) {
  const uds = num(l.unidades), precio = num(l.precio), dto = num(l.dto);
  const precioDto = dto ? r2(precio * (1 - dto / 100)) : null;
  return { uds, precio, dto, precioDto, total: r2(uds * precio * (1 - dto / 100)) };
}

function calcularTotales(f) {
  const bruto = r2(f.lineas.reduce((s, l) => s + calcularLinea(l).total, 0));
  const cuotaIva = r2(bruto * num(f.iva) / 100);
  const cuotaRe = r2(bruto * num(f.re) / 100);
  const cuotaRet = r2(bruto * num(f.ret) / 100);
  return { bruto, cuotaIva, cuotaRe, cuotaRet, total: r2(bruto + cuotaIva + cuotaRe - cuotaRet) };
}

const lineaVacia = () => ({ albaran: '', concepto: '', unidades: '', precio: '', dto: '' });
const lineaUsada = l => !!(String(l.concepto).trim() || String(l.unidades).trim() || String(l.precio).trim() || String(l.albaran).trim());

const usadosEn = anio => db.facturas.filter(f => f.anio === anio).map(f => f.n);
function siguienteNumero(anio) {
  const max = Math.max(0, ...usadosEn(anio));
  const fijado = db.emisor.siguiente && db.emisor.siguiente.anio === anio ? db.emisor.siguiente.n : 1;
  return Math.max(max + 1, fijado);
}
const textoNumero = n => (db.emisor.serie ? String(db.emisor.serie).trim() : '') + n;

function buscarCliente(nombre) {
  const k = clave(nombre);
  return k ? db.clientes.find(c => clave(c.nombre) === k) : undefined;
}

/** Artículos usados antes, con el último precio, para sugerirlos al escribir. */
function articulosConocidos() {
  const mapa = new Map();
  [...db.facturas].sort((a, b) => (a.creada || '').localeCompare(b.creada || '')).forEach(f =>
    f.lineas.forEach(l => { if (String(l.concepto).trim()) mapa.set(clave(l.concepto), { concepto: String(l.concepto).trim(), precio: l.precio }); }));
  return mapa;
}

// ---------- Pestañas ----------
let tabActual = 'nueva';
function irA(tab) {
  tabActual = tab;
  $$('.nav button').forEach(b => b.classList.toggle('activa', b.dataset.tab === tab));
  $$('.tab').forEach(s => { s.hidden = s.id !== 'tab-' + tab; });
  ({ nueva: pintarEditor, facturas: pintarFacturas, clientes: pintarClientes, ajustes: pintarAjustes })[tab]();
  window.scrollTo(0, 0);
}
$$('.nav button').forEach(b => b.addEventListener('click', () => irA(b.dataset.tab)));

// =====================================================================
//  NUEVA FACTURA
// =====================================================================
const ed = $('#editor');
const campo = n => ed.querySelector(`[name="${n}"]`);

function borradorNuevo() {
  const e = db.emisor;
  return {
    fecha: hoyISO(), numero: '', cliente: clienteVacio(), editarCliente: false,
    lineas: [lineaVacia()], iva: num(e.iva) || 21, re: 0, ret: num(e.ret),
    formaPago: e.formaPago || '', vencimiento: e.vencimiento || '', observaciones: '',
  };
}
function borrador() {
  if (!db.borrador) db.borrador = borradorNuevo();
  const b = db.borrador;
  b.cliente = { ...clienteVacio(), ...b.cliente };
  if (!b.lineas || !b.lineas.length) b.lineas = [lineaVacia()];
  if (lineaUsada(b.lineas[b.lineas.length - 1])) b.lineas.push(lineaVacia());
  return b;
}
const numeroBorrador = b => parseInt(b.numero, 10) || siguienteNumero(anioDe(b.fecha) || new Date().getFullYear());

function pintarEditor() {
  const b = borrador();
  pintarNumero();
  campo('fecha').value = b.fecha;
  campo('c_nombre').value = b.cliente.nombre;
  for (const k of ['nif', 'direccion', 'poblacion', 'provincia']) campo('c_' + k).value = b.cliente[k] || '';
  $$('[name="iva"]', ed).forEach(r => { r.checked = num(r.value) === num(b.iva); });
  for (const k of ['re', 'ret']) campo(k).value = String(num(b[k]));
  for (const k of ['formaPago', 'vencimiento', 'observaciones']) campo(k).value = b[k] || '';
  $('#mas').open = !!(num(b.re) || num(b.ret) || b.vencimiento || b.observaciones);
  $('#dl-clientes').innerHTML = [...db.clientes].sort((a, c) => a.nombre.localeCompare(c.nombre, 'es'))
    .map(c => `<option value="${esc(c.nombre)}">`).join('');
  $('#dl-articulos').innerHTML = [...articulosConocidos().values()]
    .sort((a, c) => a.concepto.localeCompare(c.concepto, 'es')).map(a => `<option value="${esc(a.concepto)}">`).join('');
  pintarCliente();
  pintarLineas();
  pintarTotales();
}

function pintarNumero() {
  const b = borrador();
  const manual = b.numero !== '';
  $('#num-ver').textContent = 'Nº ' + textoNumero(numeroBorrador(b));
  $('#num-ver').hidden = manual;
  $('#num-input').hidden = !manual;
  if (manual) $('#num-input').value = b.numero;
  $('#num-cambiar').textContent = manual ? 'automático' : 'cambiar';
}
$('#num-cambiar').addEventListener('click', () => {
  const b = borrador();
  if (b.numero === '') { b.numero = String(numeroBorrador(b)); pintarNumero(); $('#num-input').select(); }
  else { b.numero = ''; pintarNumero(); }
  guardar();
});

function pintarCliente() {
  const b = borrador();
  const guardado = buscarCliente(b.cliente.nombre);
  const c = b.cliente;
  const detalle = [c.nif, c.direccion, c.poblacion].filter(Boolean).join(' · ');
  const mostrarResumen = !!guardado && !b.editarCliente;
  $('#cli-resumen').hidden = !mostrarResumen;
  $('#cli-texto').textContent = detalle || 'Sin más datos';
  $('#cli-campos').hidden = mostrarResumen || !c.nombre.trim();
}
$('#cli-editar').addEventListener('click', () => { borrador().editarCliente = true; pintarCliente(); campo('c_nif').focus(); });

function htmlLinea(l, i) {
  const vacia = !lineaUsada(l);
  return `<div class="linea${vacia ? ' vacia' : ''}" data-i="${i}">
    <label class="l-alb"><span class="rot">Albarán</span><input data-k="albaran" value="${esc(l.albaran)}" aria-label="Albarán"></label>
    <label class="l-concepto"><span class="rot">Concepto</span><input data-k="concepto" value="${esc(l.concepto)}" list="dl-articulos"
      placeholder="${i === 0 ? 'Ej.: Mano de obra, Interruptor 16A…' : 'Añadir otra línea…'}" aria-label="Concepto" autocapitalize="characters"></label>
    <label class="l-num"><span class="rot">Unidades</span><input data-k="unidades" inputmode="decimal" value="${esc(l.unidades)}" aria-label="Unidades"></label>
    <label class="l-num"><span class="rot">Precio</span><input data-k="precio" inputmode="decimal" value="${esc(l.precio)}" aria-label="Precio"></label>
    <label class="l-num l-dto"><span class="rot">% Dto.</span><input data-k="dto" inputmode="decimal" value="${esc(l.dto)}" aria-label="Descuento"></label>
    <div class="l-total">${vacia ? '' : eur(calcularLinea(l).total)}</div>
    <button type="button" class="l-quitar" aria-label="Quitar línea" title="Quitar línea">×</button>
  </div>`;
}
function pintarLineas() {
  const b = borrador();
  $('#lineas').innerHTML = b.lineas.map(htmlLinea).join('');
  ed.classList.toggle('con-extra', !!db.emisor.mostrarAlbaranDto);
}

function pintarTotales() {
  const b = borrador();
  const t = calcularTotales(b);
  $('#desglose').innerHTML =
    `<dt>Total bruto</dt><dd>${eur(t.bruto)}</dd>` +
    `<dt>I.V.A. ${pct(num(b.iva))}</dt><dd>${eur(t.cuotaIva)}</dd>` +
    (num(b.re) ? `<dt>Rec. Equiv. ${pct(num(b.re))}</dt><dd>${eur(t.cuotaRe)}</dd>` : '') +
    (num(b.ret) ? `<dt>Retención ${pct(num(b.ret))}</dt><dd>−${eur(t.cuotaRet)}</dd>` : '');
  $('#total-grande').textContent = eur(t.total);
}

// --- Líneas: escribir, autocompletar, quitar ---
$('#lineas').addEventListener('input', ev => {
  const inp = ev.target.closest('input[data-k]');
  if (!inp) return;
  const fila = inp.closest('.linea');
  const i = +fila.dataset.i;
  const b = borrador();
  const l = b.lineas[i];
  l[inp.dataset.k] = inp.value;

  // Artículo ya usado antes: rellena el último precio
  if (inp.dataset.k === 'concepto') {
    const art = articulosConocidos().get(clave(inp.value));
    if (art && !String(l.precio).trim() && art.precio !== '') { l.precio = String(art.precio); $('[data-k=precio]', fila).value = l.precio; }
  }
  // Unidades por defecto: 1
  if ((inp.dataset.k === 'precio' || (inp.dataset.k === 'concepto' && String(l.precio).trim())) && !String(l.unidades).trim() && inp.value.trim()) {
    l.unidades = '1'; $('[data-k=unidades]', fila).value = '1';
  }

  const vacia = !lineaUsada(l);
  fila.classList.toggle('vacia', vacia);
  $('.l-total', fila).textContent = vacia ? '' : eur(calcularLinea(l).total);
  // Siempre queda una línea libre al final
  if (!vacia && i === b.lineas.length - 1) {
    b.lineas.push(lineaVacia());
    $('#lineas').insertAdjacentHTML('beforeend', htmlLinea(b.lineas[b.lineas.length - 1], b.lineas.length - 1));
  }
  pintarTotales();
  guardar();
});
$('#lineas').addEventListener('focusin', ev => {
  const inp = ev.target.closest('input[data-k]');
  if (inp && inp.inputMode === 'decimal') setTimeout(() => inp.select(), 0);
});
$('#lineas').addEventListener('click', ev => {
  if (!ev.target.closest('.l-quitar')) return;
  const b = borrador();
  b.lineas.splice(+ev.target.closest('.linea').dataset.i, 1);
  borrador(); // asegura la línea libre final
  pintarLineas(); pintarTotales(); guardar();
});

// --- Resto de campos ---
ed.addEventListener('input', ev => {
  const t = ev.target;
  if (!t.name || t.closest('#lineas')) return;
  const b = borrador();
  if (t.name === 'fecha') { b.fecha = t.value; pintarNumero(); }
  else if (t.name === 'numero') { b.numero = t.value.replace(/\D/g, ''); }
  else if (t.name === 'c_nombre') {
    b.cliente.nombre = t.value;
    const g = buscarCliente(t.value);
    if (g) { b.cliente = { ...clienteVacio(), ...g, nombre: g.nombre }; b.editarCliente = false; for (const k of ['nif', 'direccion', 'poblacion', 'provincia']) campo('c_' + k).value = b.cliente[k] || ''; }
    pintarCliente();
  }
  else if (t.name.startsWith('c_')) b.cliente[t.name.slice(2)] = t.value;
  else if (['iva', 're', 'ret'].includes(t.name)) { b[t.name] = num(t.value); pintarTotales(); }
  else if (['formaPago', 'vencimiento', 'observaciones'].includes(t.name)) b[t.name] = t.value;
  guardar();
});
ed.addEventListener('change', ev => {
  if (ev.target.name !== 'c_nombre') return;
  const g = buscarCliente(ev.target.value);
  if (g) { ev.target.value = g.nombre; borrador().cliente.nombre = g.nombre; guardar(); }
});
ed.addEventListener('change', ev => { if (ev.target.name === 'iva') { borrador().iva = num(ev.target.value); pintarTotales(); guardar(); } });
$('#num-input').addEventListener('blur', () => { const b = borrador(); if (!b.numero) { pintarNumero(); guardar(); } });

$('#btn-limpiar').addEventListener('click', () => {
  if (borrador().lineas.some(lineaUsada) && !confirm('¿Borrar lo escrito y empezar una factura nueva?')) return;
  db.borrador = borradorNuevo(); guardar(); pintarEditor(); window.scrollTo(0, 0);
});
$('#btn-vista').addEventListener('click', () => {
  const b = borrador();
  abrirVisor(facturaDesdeBorrador(b, numeroBorrador(b)), true);
});

function facturaDesdeBorrador(b, n) {
  const f = {
    id: uid(), anio: anioDe(b.fecha), n, numero: textoNumero(n), fecha: b.fecha,
    cliente: { nombre: b.cliente.nombre.trim(), nif: b.cliente.nif.trim(), direccion: b.cliente.direccion.trim(),
      poblacion: b.cliente.poblacion.trim(), provincia: b.cliente.provincia.trim() },
    emisor: Object.fromEntries(DATOS_EMISOR.map(k => [k, db.emisor[k] || ''])),
    lineas: b.lineas.filter(lineaUsada).map(l => ({ ...l, concepto: String(l.concepto).trim() })),
    iva: num(b.iva), re: num(b.re), ret: num(b.ret),
    formaPago: (b.formaPago || '').trim(), vencimiento: (b.vencimiento || '').trim(), observaciones: (b.observaciones || '').trim(),
    creada: new Date().toISOString(),
  };
  f.totales = calcularTotales(f);
  return f;
}

$('#btn-guardar').addEventListener('click', () => {
  const b = borrador();
  const e = db.emisor;

  if (!e.nombre.trim() || !e.nif.trim()) {
    aviso('Primero rellena tu nombre y NIF en "Mis datos".', 'error');
    irA('ajustes'); return;
  }
  if (!b.fecha) { aviso('Falta la fecha.', 'error'); marcarError(campo('fecha')); return; }
  if (!b.cliente.nombre.trim()) { aviso('Falta el cliente.', 'error'); marcarError(campo('c_nombre')); return; }
  const usadas = b.lineas.map((l, i) => [l, i]).filter(([l]) => lineaUsada(l));
  if (!usadas.length) { aviso('Añade al menos un trabajo o material.', 'error'); marcarError($('#lineas [data-k=concepto]')); return; }
  const sinConcepto = usadas.find(([l]) => !String(l.concepto).trim());
  if (sinConcepto) { aviso('A una línea le falta el concepto.', 'error'); marcarError($(`.linea[data-i="${sinConcepto[1]}"] [data-k=concepto]`)); return; }
  const sinPrecio = usadas.find(([l]) => !String(l.precio).trim());
  if (sinPrecio) { aviso('A una línea le falta el precio.', 'error'); marcarError($(`.linea[data-i="${sinPrecio[1]}"] [data-k=precio]`)); return; }

  const anio = anioDe(b.fecha);
  const n = numeroBorrador(b);
  if (usadosEn(anio).includes(n)) { aviso(`Ya existe la factura Nº ${textoNumero(n)} de ${anio}.`, 'error'); marcarError($('#num-input')); return; }
  const anterior = db.facturas.filter(f => f.anio === anio && f.n < n).sort((x, y) => y.n - x.n)[0];
  if (anterior && anterior.fecha > b.fecha &&
    !confirm(`La factura anterior (Nº ${anterior.numero}) es del ${fechaLarga(anterior.fecha)}, posterior a esta.\n` +
      'Las facturas deben ir en orden de fecha. ¿Guardar igualmente?')) return;
  if (!b.cliente.nif.trim() &&
    !confirm('El cliente no tiene CIF/NIF, y en una factura es obligatorio.\n¿Guardar igualmente?')) return;

  const f = facturaDesdeBorrador(b, n);
  db.facturas.push(f);
  guardarClienteDe(f.cliente);
  if (b.numero !== '' && e.siguiente && e.siguiente.anio === anio && e.siguiente.n <= n) e.siguiente = null;
  const borradorAnterior = db.borrador;
  db.borrador = borradorNuevo();
  if (!guardar()) { db.facturas.pop(); db.borrador = borradorAnterior; return; }
  pintarEditor();
  abrirVisor(f, false);
  aviso(`Factura Nº ${f.numero} guardada`, 'ok');
});

function guardarClienteDe(c) {
  const existente = buscarCliente(c.nombre) || (c.nif && db.clientes.find(x => clave(x.nif) === clave(c.nif)));
  if (existente) Object.assign(existente, c);
  else db.clientes.push({ id: uid(), ...c });
}

// =====================================================================
//  FACTURAS
// =====================================================================
const selAnio = $('#filtro-anio'), selTrim = $('#filtro-trim'), inpBuscar = $('#buscar');

function facturasFiltradas() {
  const anio = parseInt(selAnio.value, 10), trim = parseInt(selTrim.value, 10), q = clave(inpBuscar.value);
  return db.facturas
    .filter(f => f.anio === anio && (!trim || trimDe(f.fecha) === trim))
    .filter(f => !q || clave(f.cliente.nombre).includes(q) || clave(f.numero) === q || clave(f.cliente.nif).includes(q))
    .sort((a, b) => b.n - a.n);
}

function pintarFacturas() {
  const anios = [...new Set([new Date().getFullYear(), ...db.facturas.map(f => f.anio)])].sort((a, b) => b - a);
  const elegido = anios.includes(+selAnio.value) ? selAnio.value : String(anios[0]);
  selAnio.innerHTML = anios.map(a => `<option>${a}</option>`).join('');
  selAnio.value = elegido;

  const lista = facturasFiltradas();
  $('#lista-facturas').innerHTML = lista.map(f => `
    <button type="button" class="item" data-id="${esc(f.id)}">
      <span class="item-num">Nº ${esc(f.numero)} <span class="item-fecha">${fechaLarga(f.fecha)}</span></span>
      <span class="item-total">${eur(f.totales.total)}</span>
      <span class="item-cli">${esc(f.cliente.nombre)}</span>
    </button>`).join('');
  const hayAlguna = db.facturas.some(f => f.anio === +selAnio.value);
  $('#sin-facturas').hidden = lista.length > 0;
  $('#sin-facturas').textContent = !db.facturas.length ? 'Todavía no hay facturas. Haz la primera en "Nueva".'
    : hayAlguna ? 'No hay facturas que coincidan.' : `No hay facturas de ${selAnio.value}.`;

  const s = lista.reduce((a, f) => {
    a.bruto += f.totales.bruto; a.iva += f.totales.cuotaIva; a.re += f.totales.cuotaRe;
    a.ret += f.totales.cuotaRet; a.total += f.totales.total; return a;
  }, { bruto: 0, iva: 0, re: 0, ret: 0, total: 0 });
  const dato = (t, v) => `<div><dt>${t}</dt><dd>${v}</dd></div>`;
  $('#resumen').innerHTML = dato('Facturas', lista.length) + dato('Base', eur(s.bruto)) + dato('I.V.A.', eur(s.iva)) +
    (s.re ? dato('Rec. Equiv.', eur(s.re)) : '') + (s.ret ? dato('Retención', eur(s.ret)) : '') + dato('Total', eur(s.total));
  $('#btn-csv').hidden = !lista.length;
}
selAnio.addEventListener('change', pintarFacturas);
selTrim.addEventListener('change', pintarFacturas);
inpBuscar.addEventListener('input', pintarFacturas);

$('#lista-facturas').addEventListener('click', ev => {
  const item = ev.target.closest('.item');
  const f = item && db.facturas.find(x => x.id === item.dataset.id);
  if (f) abrirVisor(f, false);
});

$('#btn-csv').addEventListener('click', () => {
  const lista = facturasFiltradas().reverse();
  const n = v => fmt(v).replace(/\./g, '');
  const filas = [['Nº factura', 'Fecha', 'Cliente', 'CIF/NIF', 'Base imponible', 'IVA %', 'Cuota IVA', 'Rec. Equiv.', 'Retención', 'Total']]
    .concat(lista.map(f => [f.numero, fechaLarga(f.fecha), f.cliente.nombre, f.cliente.nif, n(f.totales.bruto), String(f.iva).replace('.', ','),
      n(f.totales.cuotaIva), n(f.totales.cuotaRe), n(f.totales.cuotaRet), n(f.totales.total)]));
  const csv = filas.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const periodo = selAnio.value + (selTrim.value ? '-' + selTrim.value + 'T' : '');
  compartirODescargar(new File(['﻿' + csv], `facturas-${periodo}.csv`, { type: 'text/csv' }), `Facturas ${periodo}`);
});

// =====================================================================
//  CLIENTES
// =====================================================================
const ficha = $('#ficha-cli');
const CAMPOS_CLI = ['nombre', 'nif', 'direccion', 'poblacion', 'provincia'];
let clienteEditando = null;

function pintarClientes() {
  const q = clave($('#buscar-cli').value);
  const lista = [...db.clientes]
    .filter(c => !q || clave(c.nombre).includes(q) || clave(c.nif).includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const facturasDe = c => db.facturas.filter(f => clave(f.cliente.nombre) === clave(c.nombre)).length;
  $('#lista-clientes').innerHTML = lista.map(c => {
    const nf = facturasDe(c);
    return `<button type="button" class="item" data-id="${esc(c.id)}">
      <span class="item-num">${esc(c.nombre)}</span>
      <span class="item-fecha">${nf ? nf + (nf === 1 ? ' factura' : ' facturas') : ''}</span>
      <span class="item-cli item-sub">${esc([c.nif, c.poblacion].filter(Boolean).join(' · ')) || 'Sin más datos'}</span>
    </button>`;
  }).join('');
  $('#sin-clientes').hidden = db.clientes.length > 0;
}
$('#buscar-cli').addEventListener('input', pintarClientes);

function abrirFicha(c) {
  clienteEditando = c || null;
  $('#ficha-titulo').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
  for (const k of CAMPOS_CLI) $(`[name="${k}"]`, ficha).value = c ? c[k] || '' : '';
  $('#cli-borrar').hidden = !c;
  ficha.hidden = false;
  ficha.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('[name="nombre"]', ficha).focus({ preventScroll: true });
}
$('#btn-nuevo-cli').addEventListener('click', () => abrirFicha(null));
$('#lista-clientes').addEventListener('click', ev => {
  const item = ev.target.closest('.item');
  const c = item && db.clientes.find(x => x.id === item.dataset.id);
  if (c) abrirFicha(c);
});
$('#cli-cancelar').addEventListener('click', () => { ficha.hidden = true; });
$('#cli-guardar').addEventListener('click', () => {
  const datos = Object.fromEntries(CAMPOS_CLI.map(k => [k, $(`[name="${k}"]`, ficha).value.trim()]));
  if (!datos.nombre) { aviso('Falta el nombre.', 'error'); marcarError($('[name="nombre"]', ficha)); return; }
  const otro = buscarCliente(datos.nombre);
  if (otro && otro !== clienteEditando) { aviso('Ya hay un cliente con ese nombre.', 'error'); marcarError($('[name="nombre"]', ficha)); return; }
  if (clienteEditando) Object.assign(clienteEditando, datos);
  else db.clientes.push({ id: uid(), ...datos });
  if (guardar()) { ficha.hidden = true; pintarClientes(); aviso('Cliente guardado', 'ok'); }
});
$('#cli-borrar').addEventListener('click', () => {
  const c = clienteEditando;
  if (!c || !confirm(`¿Borrar a ${c.nombre} de la lista?\n(Sus facturas no se borran.)`)) return;
  db.clientes = db.clientes.filter(x => x !== c);
  guardar(); ficha.hidden = true; pintarClientes(); aviso('Cliente borrado');
});

// =====================================================================
//  MIS DATOS
// =====================================================================
const aj = $('#ajustes');
const campoAj = n => aj.querySelector(`[name="${n}"]`);

function pintarAjustes() {
  const e = db.emisor;
  for (const k of [...DATOS_EMISOR, 'formaPago', 'vencimiento']) campoAj(k).value = e[k] || '';
  campoAj('iva').value = String(num(e.iva) || 21);
  campoAj('siguiente').value = siguienteNumero(new Date().getFullYear());
  campoAj('mostrarAlbaranDto').checked = !!e.mostrarAlbaranDto;
  campoAj('mostrarLogo').checked = !!e.mostrarLogo;
  $('#logo-ver').src = e.logo || LOGO_DEFECTO;
  $('#logo-defecto').hidden = !e.logo;
  $('#bienvenida').hidden = !!e.nombre;
  const sinCopia = facturasSinCopia();
  const facturasTxt = n => n === 1 ? '1 factura' : `${n} facturas`;
  $('#info-copia').textContent = !db.ultimaCopia
    ? 'Todavía no has hecho ninguna copia.' + (sinCopia ? ` Tienes ${facturasTxt(sinCopia)} sin copiar.` : '')
    : `Última copia: ${new Date(db.ultimaCopia).toLocaleDateString('es-ES')}. ` +
      (sinCopia ? `Desde entonces has hecho ${facturasTxt(sinCopia)}.` : 'Todas las facturas están en la copia.');
}

$('#btn-guardar-datos').addEventListener('click', () => {
  const e = db.emisor;
  if (!campoAj('nombre').value.trim()) { aviso('Falta tu nombre.', 'error'); marcarError(campoAj('nombre')); return; }
  if (!campoAj('nif').value.trim()) { aviso('Falta tu NIF.', 'error'); marcarError(campoAj('nif')); return; }
  const anio = new Date().getFullYear();
  const sig = parseInt(campoAj('siguiente').value, 10);
  if (sig && sig !== siguienteNumero(anio)) {
    const max = Math.max(0, ...usadosEn(anio));
    if (sig <= max) { aviso(`Ya tienes hecha la factura Nº ${max} de este año: la próxima tiene que ser mayor.`, 'error'); marcarError(campoAj('siguiente')); return; }
    e.siguiente = { anio, n: sig };
  }
  for (const k of [...DATOS_EMISOR, 'formaPago', 'vencimiento']) e[k] = campoAj(k).value.trim();
  e.iva = num(campoAj('iva').value) || 21;
  e.mostrarAlbaranDto = campoAj('mostrarAlbaranDto').checked;
  e.mostrarLogo = campoAj('mostrarLogo').checked;
  // La factura a medias también toma los nuevos valores habituales si no se habían tocado
  if (db.borrador && !db.borrador.lineas.some(lineaUsada) && !db.borrador.cliente.nombre) db.borrador = null;
  if (guardar()) { aviso('Datos guardados', 'ok'); pintarAjustes(); pintarBanda(); }
});

$('#logo-file').addEventListener('change', ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const lector = new FileReader();
  lector.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Reduce el logo para que ocupe poco
      const escala = Math.min(1, 900 / img.width, 300 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala) || 600; c.height = Math.round(img.height * escala) || 200;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      db.emisor.logo = c.toDataURL('image/png');
      db.emisor.mostrarLogo = true;
      if (guardar()) { pintarAjustes(); aviso('Logo cambiado', 'ok'); }
    };
    img.onerror = () => aviso('No se ha podido leer esa imagen.', 'error');
    img.src = lector.result;
  };
  lector.readAsDataURL(file);
});
$('#logo-defecto').addEventListener('click', () => { db.emisor.logo = null; guardar(); pintarAjustes(); });

// ---------- Copias de seguridad ----------
const facturasSinCopia = () => db.facturas.filter(f => !db.ultimaCopia || (f.creada || '') > db.ultimaCopia).length;

function descargar(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** En el móvil abre "Compartir" (WhatsApp, correo…); en el ordenador lo descarga. */
async function compartirODescargar(file, titulo) {
  if (esMovil() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: titulo }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  descargar(file);
  return true;
}

$('#btn-copia').addEventListener('click', async () => {
  const copia = { ...db, borrador: null, ultimaCopia: new Date().toISOString() };
  const file = new File([JSON.stringify(copia, null, 1)], `facturas-copia-${hoyISO()}.json`, { type: 'application/json' });
  if (await compartirODescargar(file, 'Copia de facturas')) {
    db.ultimaCopia = copia.ultimaCopia;
    guardar(); pintarAjustes(); pintarBanda();
    aviso('Copia hecha. Guárdala en el correo o en un lugar seguro.', 'ok');
  }
});

$('#restaurar-file').addEventListener('change', ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  file.text().then(txt => {
    let d;
    try { d = JSON.parse(txt); } catch (e) { d = null; }
    if (!d || !d.emisor || !Array.isArray(d.facturas)) { aviso('Ese archivo no es una copia de facturas.', 'error'); return; }
    const pregunta = db.facturas.length
      ? `Esto CAMBIA todo lo que hay ahora (${db.facturas.length} facturas) por lo de la copia (${d.facturas.length} facturas).\n¿Seguir?`
      : `¿Cargar la copia? (${d.facturas.length} facturas, ${(d.clientes || []).length} clientes)`;
    if (!confirm(pregunta)) return;
    db = normalizar(d);
    db.borrador = null;
    if (guardar()) { pintarAjustes(); pintarBanda(); aviso('Copia recuperada', 'ok'); }
  });
});

function pintarBanda() {
  const banda = $('#banda');
  const sinCopia = facturasSinCopia();
  const dias = db.ultimaCopia ? (Date.now() - new Date(db.ultimaCopia)) / 864e5 : Infinity;
  if (db.emisor.nombre && (sinCopia >= 5 || (sinCopia > 0 && dias > 30))) {
    banda.innerHTML = `<span>Tienes ${sinCopia} factura${sinCopia > 1 ? 's' : ''} sin copia de seguridad.</span>` +
      '<button type="button" class="secundario">Hacer copia ahora</button>';
    banda.hidden = false;
  } else banda.hidden = true;
}
$('#banda').addEventListener('click', ev => { if (ev.target.closest('button')) $('#btn-copia').click(); });

// =====================================================================
//  VISOR E IMPRESIÓN
// =====================================================================
function htmlFactura(f, esBorrador) {
  const e = { ...db.emisor, ...(f.emisor || {}) }; // datos del emisor tal como estaban al hacer la factura
  const filas = f.lineas.map(l => {
    const c = calcularLinea(l);
    return `<tr><td class="c">${esc(l.albaran)}</td><td class="c">${esc(l.concepto)}</td>
      <td class="n">${String(l.unidades).trim() === '' ? '' : fmt(c.uds)}</td><td class="n">${String(l.precio).trim() === '' ? '' : fmt(c.precio)}</td>
      <td class="n">${c.dto ? pct(c.dto) : ''}</td><td class="n">${c.precioDto !== null ? fmt(c.precioDto) : ''}</td>
      <td class="n">${fmt(c.total)}</td></tr>`;
  });
  // Una fila vacía arriba, como en la factura en papel, y relleno hasta el mínimo
  filas.unshift('<tr>' + '<td></td>'.repeat(7) + '</tr>');
  while (filas.length < FILAS_MINIMAS) filas.push('<tr>' + '<td></td>'.repeat(7) + '</tr>');
  const t = f.totales;
  const logo = db.emisor.mostrarLogo ? `<img src="${esc(db.emisor.logo || LOGO_DEFECTO)}" alt="">` : '';

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

const visor = $('#visor');
let facturaVisor = null;

function ajustarHoja() {
  const hoja = $('#hoja');
  hoja.style.zoom = 1;
  const ancho = $('.visor-papel').clientWidth - 24;
  hoja.style.zoom = Math.min(1, ancho / hoja.offsetWidth);
}

function abrirVisor(f, esBorrador) {
  facturaVisor = esBorrador ? null : f;
  $('#hoja').innerHTML = htmlFactura(f, esBorrador);
  $('#visor-titulo').textContent = esBorrador ? 'Así quedará (aún sin guardar)' : `Nº ${f.numero} · ${f.cliente.nombre}`;
  $('#visor-acciones').hidden = esBorrador;
  $('#visor-imprimir').hidden = esBorrador;
  if (!esBorrador) {
    const ultima = Math.max(0, ...usadosEn(f.anio));
    $('#visor-borrar').hidden = f.n !== ultima;
  }
  if (visor.hidden) history.pushState({ visor: true }, '');
  visor.hidden = false;
  document.body.style.overflow = 'hidden';
  $('.visor-papel').scrollTop = 0;
  ajustarHoja();
}
function cerrarVisor() {
  visor.hidden = true;
  facturaVisor = null;
  document.body.style.overflow = '';
  if (tabActual === 'facturas') pintarFacturas();
  pintarBanda();
}
$('#visor-cerrar').addEventListener('click', () => history.back());
window.addEventListener('popstate', () => { if (!visor.hidden) cerrarVisor(); });
window.addEventListener('resize', () => { if (!visor.hidden) ajustarHoja(); });

const tituloOriginal = document.title;
$('#visor-imprimir').addEventListener('click', () => {
  const f = facturaVisor;
  // El título se usa como nombre del PDF
  if (f) document.title = `Factura ${f.numero} ${f.anio} - ${f.cliente.nombre}`.replace(/[\\/:*?"<>|]/g, '');
  window.print();
});
window.addEventListener('beforeprint', () => { $('#hoja').style.zoom = 1; });
window.addEventListener('afterprint', () => { document.title = tituloOriginal; if (!visor.hidden) ajustarHoja(); });

$('#visor-otra').addEventListener('click', () => {
  const f = facturaVisor;
  if (!f) return;
  if (borrador().lineas.some(lineaUsada) && !confirm('Tienes una factura a medias. ¿Cambiarla por una copia de esta?')) return;
  db.borrador = {
    ...borradorNuevo(), cliente: { ...clienteVacio(), ...f.cliente },
    lineas: f.lineas.map(l => ({ ...l })), iva: f.iva, re: f.re, ret: f.ret,
    formaPago: f.formaPago, vencimiento: f.vencimiento, observaciones: f.observaciones,
  };
  guardar();
  history.back();
  irA('nueva');
  aviso('Copiada. Cambia lo que haga falta y guárdala.');
});

$('#visor-borrar').addEventListener('click', () => {
  const f = facturaVisor;
  if (!f || !confirm(`¿Borrar la factura Nº ${f.numero}?\n\nHazlo solo si te acabas de equivocar y NO se la has dado al cliente. ` +
    'Si ya la tiene, lo correcto es hacer otra con los importes en negativo (factura rectificativa).')) return;
  db.facturas = db.facturas.filter(x => x.id !== f.id);
  guardar();
  history.back();
  aviso(`Factura Nº ${f.numero} borrada`);
});

// ---------- Arranque ----------
if (!db.emisor.nombre) irA('ajustes'); else irA('nueva');
pintarBanda();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
