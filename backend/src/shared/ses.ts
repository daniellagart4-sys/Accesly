import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from './config.js';

const client = new SESClient({ region: config.aws.region });
const FROM = config.ses.fromEmail;

async function send(to: string, subject: string, html: string, text: string) {
  await client.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: text, Charset: 'UTF-8' },
      },
    },
  }));
}

export async function sendTransactionConfirmation(params: {
  email: string;
  type: 'onramp' | 'offramp';
  amountMxn: string;
  amountUsdc: string;
  txId: string;
}) {
  const label = params.type === 'onramp' ? 'depósito' : 'retiro';
  const subject = `Confirmación de ${label} — Accesly`;

  const text = [
    `Tu ${label} fue procesado.`,
    ``,
    `MXN:  ${params.amountMxn}`,
    `USDC: ${params.amountUsdc}`,
    `ID:   ${params.txId}`,
    ``,
    `Si no reconoces esta operación, contacta a soporte@accesly.io`,
  ].join('\n');

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:auto">
  <h2 style="color:#1a1a2e">Confirmación de ${label}</h2>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:8px;color:#666">MXN</td><td style="padding:8px;font-weight:600">${params.amountMxn}</td></tr>
    <tr><td style="padding:8px;color:#666">USDC</td><td style="padding:8px;font-weight:600">${params.amountUsdc}</td></tr>
    <tr><td style="padding:8px;color:#666">ID de transacción</td><td style="padding:8px;font-family:monospace;font-size:12px">${params.txId}</td></tr>
  </table>
  <p style="color:#999;font-size:12px;margin-top:24px">
    Si no reconoces esta operación, escríbenos a <a href="mailto:soporte@accesly.io">soporte@accesly.io</a>
  </p>
</div>`;

  await send(params.email, subject, html, text);
}

export async function sendSecurityAlert(params: {
  email: string;
  alertType: 'new_device' | 'signer_change';
  detail: string;
}) {
  const labels: Record<string, string> = {
    new_device:    'Nuevo dispositivo detectado',
    signer_change: 'Cambio de firmante',
  };
  const label = labels[params.alertType];
  const subject = `Alerta de seguridad — ${label}`;

  const text = [
    `Detectamos actividad en tu cuenta:`,
    ``,
    label,
    params.detail,
    ``,
    `Si no fuiste tú, contacta a soporte@accesly.io de inmediato.`,
  ].join('\n');

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:auto">
  <h2 style="color:#c0392b">Alerta de seguridad</h2>
  <p style="font-weight:600">${label}</p>
  <p style="color:#555">${params.detail}</p>
  <p style="color:#999;font-size:12px;margin-top:24px">
    Si no fuiste tú, escríbenos de inmediato a <a href="mailto:soporte@accesly.io">soporte@accesly.io</a>
  </p>
</div>`;

  await send(params.email, subject, html, text);
}
