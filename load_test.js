const http = require('http');

// Configuración de la prueba
const API_URL = 'http://localhost:4000/api/orders';
const NUM_CLIENTES = 100; // Número total de pedidos simulados
const RETRASO_ENTRE_PEDIDOS_MS = 50; // Para que no entren todos exactamente en el mismo milisegundo

const nombres = ['Juan', 'María', 'Carlos', 'Ana', 'Luis', 'Sofía', 'Andrés', 'Valeria', 'Diego', 'Camila'];
const calles = ['Calle 100', 'Avenida Siempre Viva', 'Cra 5', 'Calle Falsa 123', 'Avenida El Dorado'];

// Función para generar un pedido aleatorio
function generarPedidoAleatorio(index) {
  const nombreAleatorio = nombres[Math.floor(Math.random() * nombres.length)] + ' (Bot ' + index + ')';
  const direccionAleatoria = calles[Math.floor(Math.random() * calles.length)] + ' #' + Math.floor(Math.random() * 100);
  const total = 15000 + Math.floor(Math.random() * 20000);
  
  return {
    restaurantId: 'rest-1',
    clientName: nombreAleatorio,
    clientPhone: '300' + Math.floor(Math.random() * 9000000),
    totalAmount: total,
    status: 'PENDING',
    paymentMethod: Math.random() > 0.5 ? 'NEQUI' : 'CASH',
    deliveryAddress: direccionAleatoria,
    orderType: 'DELIVERY',
    items: [
      {
        product: {
          id: 'prod-bot',
          name: 'Hamburguesa Bot Extrema',
          price: total,
          categoryId: 'cat-1',
          imageUrl: 'https://via.placeholder.com/150',
          isAvailable: true,
          description: 'Generado automáticamente por el bot de pruebas'
        },
        quantity: 1,
        unitPrice: total,
        subtotal: total
      }
    ]
  };
}

async function enviarPedido(index) {
  const payload = JSON.stringify(generarPedidoAleatorio(index));

  const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/orders',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log(`✅ [Bot ${index}] Pedido creado exitosamente.`);
          resolve();
        } else {
          console.error(`❌ [Bot ${index}] Falló con status ${res.statusCode}: ${data}`);
          reject(new Error(`Status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ [Bot ${index}] Error de red: ${e.message}`);
      reject(e);
    });

    req.write(payload);
    req.end();
  });
}

async function iniciarPruebaDeCarga() {
  console.log(`🚀 Iniciando prueba de carga: Enviando ${NUM_CLIENTES} pedidos...`);
  console.log('Asegúrate de tener abierta la pantalla del PDV (http://localhost:5173/admin/pos) para ver la magia.');
  
  let exitosos = 0;
  let fallidos = 0;
  
  const promesas = [];

  for (let i = 1; i <= NUM_CLIENTES; i++) {
    // Retrasar ligeramente cada petición para simular una ráfaga progresiva
    const promesa = new Promise((resolve) => setTimeout(resolve, i * RETRASO_ENTRE_PEDIDOS_MS))
      .then(() => enviarPedido(i))
      .then(() => exitosos++)
      .catch(() => fallidos++);
      
    promesas.push(promesa);
  }

  await Promise.all(promesas);

  console.log('\n================================');
  console.log('🏁 PRUEBA DE CARGA FINALIZADA');
  console.log(`✔️ Pedidos Exitosos: ${exitosos}`);
  console.log(`✖️ Pedidos Fallidos: ${fallidos}`);
  console.log('================================\n');
}

iniciarPruebaDeCarga();
