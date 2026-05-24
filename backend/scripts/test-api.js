const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: 'localhost', port: 5000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 5000, path, method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject); req.end();
  });
}

async function main() {
  const login = await post('/api/auth/login', { email: 'finance@yealmaz.com', password: 'Finance@YeAlmaz2024' });
  if (!login.body.token) { console.error('Login failed:', login.body); return; }
  console.log('Logged in as:', login.body.user?.name, '| role:', login.body.user?.role);

  const res = await get('/api/cases?limit=5&page=1', login.body.token);
  console.log('GET /api/cases — Status:', res.status);
  if (res.status === 200) {
    console.log('Total cases:', res.body.pagination?.total);
    console.log('Cases returned:', res.body.cases?.length);
    console.log('First:', res.body.cases?.[0]?.caseNumber);
  } else {
    console.log('Error:', JSON.stringify(res.body));
  }
}
main().catch(console.error);
