const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
   const idx = line.indexOf('=');
   if (idx > -1) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k && v) env[k] = v;
   }
});

const url25 = env['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1/appointments?id=eq.186ef9f6-3b54-45df-a06b-97887d7eb1e2';
const url26 = env['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1/appointments?id=eq.480f52cd-7088-4ae4-a11b-8d516eb07af0';
const key = env['SUPABASE_SERVICE_ROLE_KEY'];

const headers = {
   'apikey': key,
   'Authorization': 'Bearer ' + key,
   'Content-Type': 'application/json',
   'Prefer': 'return=representation'
};

Promise.all([
   fetch(url25, { method: 'PATCH', headers, body: JSON.stringify({ scheduled_at: '2026-02-25T11:00:00+00:00' }) }).then(r => r.json()),
   fetch(url26, { method: 'PATCH', headers, body: JSON.stringify({ scheduled_at: '2026-02-26T11:00:00+00:00' }) }).then(r => r.json())
]).then(res => console.log(JSON.stringify(res, null, 2))).catch(console.error);
