import { loadEnvFiles } from '../server/env.js';
import { getEmailProviderInfo, deliverOtpEmail } from '../server/mailer.js';

loadEnvFiles();

const targetEmail = process.argv[2] ? String(process.argv[2]).trim().toLowerCase() : '';
const info = getEmailProviderInfo();
const sbUrl = String(process.env.SUPABASE_URL || '').trim();
const sbAnon = String(process.env.SUPABASE_ANON_KEY || '').trim();

console.log('=== Mini-Games · Diagnóstico de Envío OTP ===');
console.log('Supabase Auth configurado:', Boolean(sbUrl && sbAnon));
console.log('Proveedor de correo backend:', info.provider);
console.log('Remitente SMTP_FROM:', info.fromAddress || '(sin configurar / inválido)');
if (info.warnings.length > 0) {
  for (const w of info.warnings) console.warn('ADVERTENCIA:', w);
}

if (!targetEmail) {
  console.log('\nUso para prueba real de aceptación del proveedor:');
  console.log('  npm.cmd run check:email -- correo_prueba@dominio.com');
  process.exit(info.configured || (sbUrl && sbAnon) ? 0 : 1);
}

if (!info.configured) {
  console.error('\nERROR: No hay credenciales externas en .env (RESEND_API_KEY + SMTP_FROM o SMTP_HOST).');
  process.exit(1);
}

console.log(`\nEnviando código OTP de prueba real a ${targetEmail}...`);
const result = await deliverOtpEmail({
  email: targetEmail,
  code: '000000',
  purpose: 'verify_email'
});

console.log('Resultado del proveedor:', JSON.stringify(result, null, 2));
if (result.status !== 'sent') {
  console.error('\nPRUEBA FALLIDA: El proveedor rechazó o no pudo completar el envío.');
  process.exit(1);
}
console.log('\nPRUEBA ACEPTADA: El proveedor aceptó el correo.');
