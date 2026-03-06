const os = require('os');

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

const ip = getLocalIP();
const divider = '='.repeat(42);

console.log('\n' + divider);
console.log('  iMath - Truy cap qua mang noi bo');
console.log(divider);
console.log('  Tu MAY NAY:');
console.log('    http://localhost:3000');
console.log('');
if (ip) {
  console.log('  Tu thiet bi KHAC (may tinh bang, dien thoai):');
  console.log(`    http://${ip}:3000`);
} else {
  console.log('  Khong tim thay IP noi bo -- hay ket noi WiFi truoc.');
}
console.log('');
console.log('  Dam bao tat ca thiet bi cung mang WiFi!');
console.log(divider + '\n');
