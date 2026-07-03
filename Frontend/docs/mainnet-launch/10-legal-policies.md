# Fase 10: Legal y Policies

Publicar Terms of Service, Privacy Policy, cookie banner y warning modals con textos legalmente defendibles. Sin audit externo, el legal formal es más importante.

Duración estimada: 2 días (si usás templates) o 1 a 2 semanas (si contratás abogado).

## Prerequisitos

- Dominio `accesly.xyz` configurado y sirviendo.
- Decisión previa: ¿templates open source o abogado profesional?

## Recomendación de scope

Para MVP y beta cerrada, usar templates de OSS wallets (Rainbow, Bitcoin Core, Zeus) como base. Adaptar a Accesly. Antes de scaling público a > 500 users, contratar abogado especializado en Web3 LATAM que revise.

## Paso 1: Terms of Service

Crear `Accesly/Frontend/src/pages/terms.astro`.

Estructura:

1. Definiciones
2. Aceptación
3. Elegibilidad (mayor 18, no OFAC, no país sancionado)
4. Descripción del servicio (SDK, backend, no custodial)
5. Wallets del usuario y responsabilidad
6. Limitaciones de responsabilidad
7. Sin garantía de recovery si passphrase perdida + device perdido
8. KYC vía Dynerox obligatorio para fiat
9. Cambios en los términos
10. Ley aplicable y jurisdicción

Puntos concretos a incluir:

- "Wallet no custodial: perdés acceso si perdés device + passphrase."
- "Testnet: sin valor real, sin garantías."
- "Mainnet: fondos reales, use at own risk, Accesly no responsable por pérdidas por bug, hack, error del user."
- "Prohibido para users en OFAC, UN sanctions list, o jurisdicciones sancionadas."
- "KYC y screening AML lo hace Dynerox como partner, sus términos aplican."
- "Retención de datos: user_fragments hasta cierre + 5 años, audit_logs 7 años, KYC data según Dynerox retention policy."
- "Cambios: 30 días de aviso email para cambios materiales."

## Paso 2: Privacy Policy

Crear `Accesly/Frontend/src/pages/privacy.astro`.

Estructura:

1. Qué datos guardamos
2. Cómo los usamos
3. Con quién los compartimos
4. Cuánto tiempo los guardamos
5. Derechos del usuario (GDPR, LGPD)
6. Cookies y tracking
7. Contacto para privacy queries

Datos que guardamos:

- Email (hash + plaintext para OTP delivery)
- Cognito sub (uuid)
- Phone (opcional)
- Fragments cifrados (F2 + F3, ciphertext opaco)
- Address de wallet on chain
- Historia de transacciones (proxy de Stellar)
- KYC data via Dynerox (retention en Dynerox, no en Accesly directo)
- Audit logs (90 días)
- Analytics minimal (Vercel Analytics agregados, no PII)

Sharing:

- Dynerox: KYC data
- AWS: hosting infrastructure (Cognito, Lambda, DynamoDB, KMS)
- Meta: no compartimos con Meta hoy
- Google: OAuth Federated login (email + Google sub)

Derechos GDPR/LGPD:

- Acceso: podés pedir copia de tus datos
- Rectificación
- Borrado (con excepciones AML/CFT que exigen retention)
- Portabilidad
- Objeción a procesamiento

Contacto: `privacy@accesly.xyz` (crear este mailbox si no existe).

## Paso 3: Cookie banner

Si target incluye EU, es obligatorio. Para LATAM primary, opcional pero recomendado.

Crear componente `Accesly/Frontend/src/components/CookieBanner.astro`:

```astro
---
// Cookie banner mínimo
---
<div id="cookie-banner" class="cookie-banner" hidden>
  <p>Usamos cookies esenciales para autenticación. Al continuar aceptás nuestra <a href="/privacy">política de privacidad</a>.</p>
  <button onclick="acceptCookies()">Aceptar</button>
</div>

<script>
  const KEY = 'accesly-cookie-consent';
  if (!localStorage.getItem(KEY)) {
    document.getElementById('cookie-banner').hidden = false;
  }
  function acceptCookies() {
    localStorage.setItem(KEY, 'accepted');
    document.getElementById('cookie-banner').hidden = true;
  }
</script>
```

Incluir en `LandingLayout.astro` y `DocsLayout.astro`.

## Paso 4: Warning modal al crear wallet mainnet

Esto ya está en Fase 6 del SDK. Verificar que el copy legal sea:

> "Estás por crear una wallet MAINNET.
>
> - Los fondos son reales.
> - Si perdés tu passphrase Y tu device, no hay recuperación posible.
> - Al continuar, aceptás los [Términos de Uso](https://accesly.xyz/terms) y la [Política de Privacidad](https://accesly.xyz/privacy).
> - Prohibido si estás en OFAC, UN sanctions, o país sancionado.
>
> [ ] Entiendo las consecuencias."

## Paso 5: KYC consent screen

Antes de mandar CURP a Dynerox, mostrar screen de consentimiento:

> "Para habilitar on ramp de MXN a USDC, vamos a compartir tus datos con Dynerox, nuestro partner regulado para operaciones bancarias.
>
> Datos compartidos:
> - Nombre completo
> - CURP
> - Fecha de nacimiento
> - CLABE bancaria
> - Teléfono
>
> Dynerox guarda esta información 5 años según normativa AML/CFT México.
>
> [ ] Autorizo el compartir de datos con Dynerox."

Este componente vive en el SDK kit como parte del `<AddFundsFlow />` (Fase 6).

## Paso 6: Documento interno de incident response

Crear `Accesly/Frontend/docs/incident-response.md` (interno, no público):

```markdown
# Incident Response Plan

## Detección
- CloudWatch alarms → PagerDuty
- Reports de users vía email o Twitter
- Detección proactiva vía monitoring

## Respuesta inicial (< 1h)
1. Ack del incidente
2. Escalación al team lead
3. Assessment de impacto (users afectados, monto)
4. Decisión: pausar mainnet (Fase 8 kill switch) o mitigar sin pausa

## Comunicación
- Interna: canal Slack dedicado
- Externa <24h si data breach: email a todos los users afectados
- Twitter update si el issue es visible al público

## GDPR compliance
- Data breach: disclosure a autoridad de protección de datos en < 72h
- Notificación individual a users afectados si "high risk"

## Post mortem
- Timeline en formato markdown
- Root cause
- Impacto cuantificado
- Fix aplicado
- Preventiva permanente
```

## Paso 7: Bug bounty program

Publicar en `Accesly/Frontend/src/pages/security.astro` (público):

```markdown
# Security Bug Bounty

Reportar vulnerabilidades a security@accesly.xyz con:
- Descripción del bug
- Steps to reproduce
- Impact assessment
- Proof of concept (opcional)

Response time: 48h para triage.

Recompensas iniciales (post GA formal via HackerOne/Immunefi):
- Critical: hasta $10,000 USD
- High: hasta $2,000 USD
- Medium: hasta $500 USD
- Low: hasta $100 USD
- Hall of fame público para reporters responsables

No incluir: DoS, ingeniería social, físico. Ver scope completo en Terms of Bounty.
```

## Paso 8: Compliance operacional

Documentar internamente (no público):

- **Retention schedule**: cronjob que verifica que audit_logs > 90 días se borren. Ya está implementado vía DDB TTL, verificar que funciona.
- **Data export tool**: script one shot que dado un `userId` exporta todos sus datos (para GDPR access requests).
- **Deletion tool**: script one shot que dado un `userId` marca la cuenta como cerrada y programa deletion post retention window.
- **Sanctions screening**: hoy vive en Dynerox. Documentar el proceso: si un user cae en lista, cómo se notifica y qué se hace con los fondos existentes.

## Criterio de done

- `/terms` publicado y linked desde footer del landing
- `/privacy` publicado y linked
- Cookie banner en el layout global
- Warning modal en `<CreateWalletFlow />` mainnet
- KYC consent screen en `<AddFundsFlow />`
- Runbook interno de incident response escrito
- Bug bounty program público con contact email

## Riesgos

- **Legal formal es opinión**: los templates OSS son buenos punto de partida pero no son consejo legal. Para operaciones a escala en LATAM, abogado especializado es obligatorio.
- **Discrepancia entre what dice ToS y what hace el sistema**: cada vez que cambia el sistema, revisar que ToS sigan siendo verdaderos. Ej: si agregamos WhatsApp, actualizar sharing section del Privacy.

## Notas

Ninguna todavía.
