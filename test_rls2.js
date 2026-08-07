const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
let url = '', key = '';
let anon = '';
env.split('\n').forEach(l => {
  if(l.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = l.split('=')[1].trim().replace(/['"]/g, '');
  if(l.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) anon = l.split('=')[1].trim().replace(/['"]/g, '');
});

// Create client with Anon key to simulate user
const supabase = createClient(url, anon);

async function run() {
  // First, we need to sign in as the user.
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'micheltsuboi@gmail.com', // The user's email?
    password: 'password123' // we don't know the password...
  });
}
run();
