const http = require('http');

http.get('http://127.0.0.1:4000/api/restaurants/demo', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data}`);
  });
}).on('error', (err) => {
  console.log('Error: ' + err.message);
});
