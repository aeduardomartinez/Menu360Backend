const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/orders',
  method: 'GET'
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => {
    data += chunk;
  });
  res.on('end', () => {
    const orders = JSON.parse(data);
    if (orders.length > 0) {
      const order = orders[0];
      console.log('Found order:', order.id);
      
      const patchOptions = {
        hostname: 'localhost',
        port: 5000,
        path: `/api/orders/${order.id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const patchReq = http.request(patchOptions, patchRes => {
        let patchData = '';
        patchRes.on('data', chunk => { patchData += chunk; });
        patchRes.on('end', () => {
          console.log('Status code:', patchRes.statusCode);
          console.log('Response:', patchData);
        });
      });
      
      patchReq.write(JSON.stringify({ status: 'DELIVERED', paymentMethod: 'Efectivo' }));
      patchReq.end();
    }
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
