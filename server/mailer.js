import nodemailer from 'nodemailer';

function extractBareEmail(fromHeader) {
  const s = String(fromHeader || '').trim();
  const match = s.match(/<([^>]+)>/);
  return (match ? match[1] : s).trim().toLowerCase();
}

function isPlaceholderFromAddress(fromHeader) {
  const email = extractBareEmail(fromHeader);
  if (!email || !email.includes('@')) return true;
  const domain = email.split('@')[1] || '';
  return (
    domain === 'example.com' ||
    domain === 'example.org' ||
    domain === 'example.net' ||
    domain === 'localhost'
  );
}

export function getEmailProviderInfo() {
  const hasResend = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim());
  const hasSmtp = Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_HOST.trim() &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
  const fromAddress = String(process.env.SMTP_FROM || '').trim();
  const hasValidFrom = !isPlaceholderFromAddress(fromAddress);
  const warnings = [];

  if (hasResend && !hasValidFrom) {
    warnings.push(
      'Falta SMTP_FROM o usa @example.com; Resend exige un dominio propio verificado en SMTP_FROM para enviar a cualquier usuario.'
    );
  }
  if (hasResend && extractBareEmail(fromAddress) === 'onboarding@resend.dev') {
    warnings.push(
      'SMTP_FROM=onboarding@resend.dev solo permite envíos de prueba al dueño de la cuenta Resend y rechaza correos externos.'
    );
  }
  if (hasSmtp && !hasValidFrom && !isPlaceholderFromAddress(process.env.SMTP_USER)) {
    // Allow SMTP_FROM defaulting to SMTP_USER if valid email
  }

  let provider = 'none';
  if (hasResend) provider = 'resend';
  else if (hasSmtp) provider = 'smtp';

  return {
    configured: provider !== 'none',
    provider,
    fromAddress: hasValidFrom ? fromAddress : '',
    testConsoleMode: process.env.MINIGAMES_TEST_CONSOLE_OTP === '1',
    warnings
  };
}

function purposeCopy(purpose) {
  if (purpose === 'reset_password') {
    return {
      subject: 'Restablece tu contraseña de Mini-Games',
      heading: 'Recuperación de contraseña',
      intro: 'Introduce este código de 6 dígitos para restablecer tu contraseña en Mini-Games:'
    };
  }
  if (purpose === 'login') {
    return {
      subject: 'Tu código de acceso a Mini-Games',
      heading: 'Inicio de sesión sin contraseña',
      intro: 'Introduce este código de 6 dígitos para acceder a tu cuenta:'
    };
  }
  return {
    subject: 'Verifica tu correo en Mini-Games',
    heading: 'Confirma tu registro en Mini-Games',
    intro: 'Introduce este código OTP de 6 dígitos para completar la creación de tu cuenta:'
  };
}

function buildOtpHtml(code, purpose) {
  const copy = purposeCopy(purpose);
  return `
    <div style="font-family:Inter,Arial,sans-serif;background:#0e1217;color:#f4f1ea;padding:28px;border-radius:12px;max-width:480px;margin:0 auto;">
      <h2 style="margin:0 0 10px;color:#f58229;">${copy.heading}</h2>
      <p style="margin:0 0 18px;color:#cbd5e1;font-size:15px;line-height:1.5;">${copy.intro}</p>
      <div style="background:#171d26;border:1px solid #2d3748;border-radius:10px;padding:16px;text-align:center;margin-bottom:18px;">
        <span style="font-family:monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:#1ad1be;">${code}</span>
      </div>
      <p style="margin:0;color:#94a3b8;font-size:13px;">Este código caduca en 10 minutos y solo admite 5 intentos.</p>
    </div>
  `.trim();
}

function mapResendError(httpStatus, body) {
  const raw = String(body?.message || body?.error || '');
  const low = raw.toLowerCase();
  if (httpStatus === 401 || low.includes('api key')) {
    return {
      errorCode: 'RESEND_INVALID_KEY',
      errorMessage: 'RESEND_API_KEY es inválida o fue revocada. Revisa tu clave en Resend.'
    };
  }
  if (
    httpStatus === 403 ||
    low.includes('verify a domain') ||
    low.includes('testing emails to your own email')
  ) {
    return {
      errorCode: 'RESEND_DOMAIN_REQUIRED',
      errorMessage:
        'Resend rechazó el envío a este destinatario porque el remitente/dominio no está verificado para correos externos.'
    };
  }
  if (httpStatus === 422) {
    return {
      errorCode: 'RESEND_UNPROCESSABLE',
      errorMessage: `Resend rechazó el formato o remitente del correo: ${raw || 'HTTP 422'}`
    };
  }
  if (httpStatus === 429) {
    return {
      errorCode: 'RESEND_RATE_LIMIT',
      errorMessage: 'Resend alcanzó el límite de envíos por segundo. Espera un momento e intenta reenviar.'
    };
  }
  return {
    errorCode: String(body?.name || `RESEND_HTTP_${httpStatus || 'ERROR'}`),
    errorMessage: raw || `Error del proveedor de correo (HTTP ${httpStatus}).`
  };
}

export async function deliverOtpEmail({ email, code, purpose = 'verify_email' }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const copy = purposeCopy(purpose);

  // Explicit isolated test mode only
  if (process.env.MINIGAMES_TEST_CONSOLE_OTP === '1' && !process.env.RESEND_API_KEY && !process.env.SMTP_HOST) {
    console.log(`[Mini-Games OTP] email=${cleanEmail} purpose=${purpose} code=${code}`);
    return { status: 'console_test', provider: 'console' };
  }

  const resendKey = String(process.env.RESEND_API_KEY || '').trim();
  const rawFrom = String(process.env.SMTP_FROM || '').trim();

  // 1. External HTTPS API: Resend (recommended for Render/cloud where port 25/465 may be restricted)
  if (resendKey) {
    if (isPlaceholderFromAddress(rawFrom)) {
      const msg =
        'SMTP_FROM no está configurado con un dominio real verificado en Resend (no uses example.com).';
      console.error(`[Mini-Games Mailer Error] provider=resend status=rejected reason="${msg}"`);
      return {
        status: 'rejected',
        provider: 'resend',
        httpStatus: 422,
        errorCode: 'INVALID_FROM_ADDRESS',
        errorMessage: msg
      };
    }

    const baseUrl = String(process.env.RESEND_API_BASE_URL || 'https://api.resend.com').replace(/\/$/, '');
    try {
      const resp = await fetch(`${baseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          from: rawFrom,
          to: [cleanEmail],
          subject: `${copy.subject}: ${code}`,
          text: `${copy.intro} ${code}\n\nCaduca en 10 minutos.`,
          html: buildOtpHtml(code, purpose)
        })
      });

      const payload = await resp.json().catch(() => ({}));
      if (resp.ok && payload?.id) {
        return {
          status: 'sent',
          provider: 'resend',
          messageId: String(payload.id)
        };
      }

      const mapped = mapResendError(resp.status, payload);
      console.error(
        `[Mini-Games Mailer Error] provider=resend http=${resp.status} code=${mapped.errorCode} email=${cleanEmail} detail="${payload?.message || ''}"`
      );
      return {
        status: 'rejected',
        provider: 'resend',
        httpStatus: resp.status,
        ...mapped
      };
    } catch (err) {
      const msg = err?.message || 'Error de red conectando con api.resend.com';
      console.error(`[Mini-Games Mailer Error] provider=resend network_error="${msg}"`);
      return {
        status: 'rejected',
        provider: 'resend',
        httpStatus: 502,
        errorCode: 'RESEND_NETWORK_ERROR',
        errorMessage: `No se pudo contactar con Resend: ${msg}`
      };
    }
  }

  // 2. External Custom SMTP (Resend SMTP, Brevo, Postmark, Zoho, etc.) via Nodemailer
  const smtpHost = String(process.env.SMTP_HOST || '').trim();
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const smtpPass = String(process.env.SMTP_PASS || '');
  if (smtpHost) {
    const port = Number(process.env.SMTP_PORT || 465);
    const secure =
      process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : port === 465;
    const effectiveFrom = !isPlaceholderFromAddress(rawFrom)
      ? rawFrom
      : !isPlaceholderFromAddress(smtpUser)
        ? smtpUser
        : '';

    if (!effectiveFrom) {
      const msg = 'Falta SMTP_FROM válido para enviar correos por SMTP.';
      console.error(`[Mini-Games Mailer Error] provider=smtp status=rejected reason="${msg}"`);
      return {
        status: 'rejected',
        provider: 'smtp',
        errorCode: 'INVALID_FROM_ADDRESS',
        errorMessage: msg
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure,
        auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 12_000
      });

      const info = await transporter.sendMail({
        from: effectiveFrom,
        to: cleanEmail,
        subject: `${copy.subject}: ${code}`,
        text: `${copy.intro} ${code}\n\nCaduca en 10 minutos.`,
        html: buildOtpHtml(code, purpose)
      });

      if (Array.isArray(info.rejected) && info.rejected.length > 0 && (!info.accepted || info.accepted.length === 0)) {
        const msg = `El servidor SMTP rechazó al destinatario ${cleanEmail}.`;
        console.error(`[Mini-Games Mailer Error] provider=smtp status=rejected detail="${msg}"`);
        return {
          status: 'rejected',
          provider: 'smtp',
          errorCode: 'SMTP_RECIPIENT_REJECTED',
          errorMessage: msg
        };
      }

      return {
        status: 'sent',
        provider: 'smtp',
        messageId: info.messageId || 'smtp-accepted'
      };
    } catch (err) {
      const msg = err?.response || err?.message || 'Error conectando con el servidor SMTP';
      console.error(`[Mini-Games Mailer Error] provider=smtp code=${err?.code || 'ERR'} detail="${msg}"`);
      return {
        status: 'rejected',
        provider: 'smtp',
        errorCode: err?.code || 'SMTP_SEND_FAILED',
        errorMessage: `Error SMTP: ${msg}`
      };
    }
  }

  // 3. No provider configured: NEVER pretend email was delivered
  return {
    status: 'unconfigured',
    provider: 'none',
    errorCode: 'EMAIL_PROVIDER_NOT_CONFIGURED',
    errorMessage:
      'No hay ningún proveedor de correo configurado en el servidor (RESEND_API_KEY + SMTP_FROM, SMTP_HOST o Supabase Auth).'
  };
}
