const http = require('http');

const key = '123123';

console.log(`Testing Admin Key: '${key}'`);

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/applications',
    method: 'GET',
    headers: {
        'x-admin-key': key
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => {
        body += chunk;
    });
    res.on('end', () => {
        console.log(`Status Code: ${res.statusCode}`);
        if (res.statusCode === 200) {
            console.log('Admin Key Verified: SUCCESS');
        } else {
            console.log('Admin Key Verified: FAILED');
            console.log('Response:', body);
        }
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.end();
