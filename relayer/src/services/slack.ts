import { config } from '../config.js';

type Severity = 'info' | 'warning' | 'critical';

const COLORS: Record<Severity, string> = {
  info: '#0078d7',
  warning: '#ffa500',
  critical: '#ff0000',
};

const EMOJIS: Record<Severity, string> = {
  info: ':information_source:',
  warning: ':warning:',
  critical: ':rotating_light:',
};

export async function notify(message: string, severity: Severity = 'info'): Promise<void> {
  if (!config.slack.webhookUrl) return;

  try {
    await fetch(config.slack.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${EMOJIS[severity]} *Accesly Relayer*`,
        attachments: [
          {
            color: COLORS[severity],
            text: message,
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      }),
    });
  } catch (err) {
    console.error('[slack] Failed to send alert:', err);
  }
}
