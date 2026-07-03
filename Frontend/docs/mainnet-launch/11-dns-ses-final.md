# Fase 11: DNS y SES Final

Resolver el mix de nameservers en Namecheap (Route53 solo) y confirmar SES production access.

Duración estimada: 4 a 6 horas más esperas de propagación.

## Prerequisitos

- Route53 hosted zone `accesly.xyz` existe en AWS.
- SES DKIM ya está verified (confirmed).
- Acceso a Namecheap panel para el dominio.

## Estado actual del DNS

Namecheap actualmente tiene mix de nameservers:

- 2 de Vercel (`vercel-dns-017.com`)
- 4 de AWS Route53 (`awsdns-*`)

Esto causa que resoluciones DNS caigan aleatoriamente en Vercel o AWS, y como cada uno tiene una zona diferente, ~67% de las queries devuelven NXDOMAIN.

## Paso 1: Consolidar a Route53

Ir a Namecheap → Domain List → `accesly.xyz` → Manage → Domain tab → Nameservers.

- [ ] Cambiar de "Custom DNS" a solo los 4 nameservers de AWS Route53.
- [ ] Quitar las 2 entries de `vercel-dns-017.com`.
- [ ] Save.

Propagación toma 15 min a 4h según ISP del user. Verificar con:

```bash
dig accesly.xyz NS +short
```

Debe devolver solo las 4 addresses `awsdns-*`.

## Paso 2: Agregar records de Vercel en Route53

Como Vercel ya no controla el DNS, hay que agregar los records manualmente en Route53.

Para cada subdomain que apunta a Vercel:

- `app.accesly.xyz` → CNAME → `cname.vercel-dns.com`
- `dev.accesly.xyz` → CNAME → `cname.vercel-dns.com`

En Route53:

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id <ZONE_ID> \
  --change-batch file://change.json
```

Con `change.json`:

```json
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "app.accesly.xyz",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{ "Value": "cname.vercel-dns.com" }]
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "dev.accesly.xyz",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{ "Value": "cname.vercel-dns.com" }]
      }
    }
  ]
}
```

En Vercel, ir a cada proyecto y en Domains agregar el custom domain. Vercel valida el CNAME y emite el SSL cert automáticamente.

## Paso 3: Records adicionales

- [ ] `api.accesly.xyz` → CNAME → API Gateway custom domain (se configura en Fase que instale el custom domain de API Gateway, o via alias record apuntando al CloudFront distribution del API Gateway).
- [ ] `docs.accesly.xyz` (opcional, futuro) → CNAME a Vercel

## Paso 4: MX records para email

Si vas a usar `no-reply@accesly.xyz` como remitente SES, el MX no es estrictamente necesario (SES envía outbound sin needing inbound). Pero para deliverability y compliance:

- [ ] MX record apuntando a un email provider (Gmail Workspace, Zoho, etc.) si querés recibir email a `security@accesly.xyz`, `privacy@accesly.xyz`
- [ ] Sin MX, esos emails simplemente bouncean

## Paso 5: SPF, DKIM, DMARC

DKIM ya verified (según el mail de AWS del 29 de junio). Verificar SPF y DMARC:

```bash
dig accesly.xyz TXT +short
```

Debe incluir:

- SPF: `v=spf1 include:amazonses.com ~all` (o similar con AWS SES)
- DMARC: `_dmarc.accesly.xyz TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@accesly.xyz"`

Si falta alguno, agregar en Route53.

## Paso 6: SES production access

Estado actual: case AWS `177889633800399` denegado.

Reopen con más argumentos:

```powershell
aws sesv2 put-account-details `
  --production-access-enabled `
  --mail-type TRANSACTIONAL `
  --website-url "https://accesly.xyz" `
  --use-case-description "Accesly is a non-custodial Stellar wallet SDK. We send transactional OTP emails to end users during account recovery flow. Each email is triggered by the user themselves clicking 'Recover wallet' in the SDK UI. Volume: 100-500 emails/day initial, growing with beta adoption. No marketing emails, no bulk lists. Suppression list compliance via SES managed list + SNS bounce feedback. DKIM verified for domain accesly.xyz." `
  --contact-language EN `
  --additional-contact-email-addresses acceslyoficial@gmail.com
```

Si el ConflictException persiste, ir manualmente al Support Center:

1. https://console.aws.amazon.com/support/home
2. Cases → find case 177889633800399
3. Reply al case con la use case description arriba
4. Adjuntar screenshot del DKIM verified

Response esperada de AWS en 24 a 48h.

## Paso 7: Verify domain identity en SES

Además de DKIM, el domain identity mismo debe estar verified. Chequear:

```bash
aws sesv2 get-email-identity --email-identity accesly.xyz --region us-east-1
```

Debe devolver `VerifiedForSendingStatus: true`.

Si no está verified, en la consola SES → Verified identities → Create identity → Domain → `accesly.xyz`. Copiar los TXT records que da y agregarlos a Route53. Wait 5-10 min. Refresh en SES console.

## Paso 8: Test end to end

Con SES production access y dominio verified:

- [ ] Manual: mandar OTP a un email NO verificado previamente (por ejemplo un email random tuyo)
- [ ] Verificar que llega al inbox (no spam)
- [ ] Chequear headers del email: DKIM pass, SPF pass, DMARC pass
- [ ] Bounce test: mandar OTP a email inexistente, verificar que llegue el bounce al SNS topic

## Paso 9: Configurar sending limits

Con production access AWS default es 200 emails/día. Para producción real hay que pedir aumento:

```powershell
aws sesv2 put-account-sending-attributes --production-access-enabled
```

Si necesitás > 200/día desde day 1, request via AWS Support:

- New quota: 5000 emails/día
- Justificación: volume estimate del beta cerrado

Esto puede tardar otras 24-48h.

## Criterio de done

- Namecheap con 4 nameservers Route53 (sin Vercel)
- `dev.accesly.xyz` resuelve al dashboard Vercel deployment
- `app.accesly.xyz` resuelve al demo Vercel deployment
- `accesly.xyz` resuelve al landing Vercel deployment
- `api.accesly.xyz` resuelve al API Gateway (custom domain configurado)
- SES production access = enabled
- Test manual: OTP a email random llega correcto

## Riesgos

- **Propagación DNS lenta**: algunos ISP tienen cache de 24h. Si un tester no puede acceder inmediatamente, puede ser cache local.
- **SES production access rechazado again**: AWS puede pedir más info sobre volume o opt-in. Preparar respuesta detallada con métricas del beta cerrado.

## Notas

Ninguna todavía.
