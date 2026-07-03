# Fase 5: Dynerox Integration

Reemplazar Etherfuse por Dynerox como proveedor de KYC + on ramp + off ramp MXN. Dynerox soporta Stellar USDC nativo (confirmado por el proveedor).

Duración estimada: 3 a 4 días.

## Prerequisitos

- API keys de Dynerox: `sk_test_*` (sandbox para testnet apps) y `sk_live_*` (prod para mainnet apps). Solicitar al account manager de Dynerox.
- Webhook secret que Dynerox devuelve al registrar el endpoint.
- Repo `CloudServices-accesly` local para el trabajo backend.
- Repo `SDKAccesly` local para tipos + hooks (esto sucede en la Fase 6, aquí solo backend).

## Referencia de la API Dynerox

Base URL sandbox: `https://api-stage.dynerox.com`
Base URL prod: pedir a account manager.

Endpoints principales de `/v1/public/*`:

- `POST /users` — crear user KYC. Body: `first_name`, `middle_name?`, `last_name`, `second_last_name?`, `email`, `curp`, `phone?`. Response con `user_id` (UUID Dynerox).
- `GET /users/{user_id}` — status del user.
- `POST /beneficiary-accounts` — registrar CLABE. Body: `user_id?`, `clabe`, `currency`, `network`.
- `POST /routes` — crear instrucción on ramp o off ramp. Body: `user_id?`, `from`, `to` (cada uno con currency, network, account).
- `GET /routes` — listar routes del user.
- `GET /banks/clabe/{clabe_id}` — banco asociado a un CLABE.
- `POST /webhooks` — registrar webhook.

Auth: header `x-api-key: sk_live_xxx` o `sk_test_xxx`.

## Paso 1: Guardar API keys en Secrets Manager

```bash
aws secretsmanager create-secret \
  --name accesly/dev/dynerox-sandbox-key \
  --secret-string 'sk_test_xxxxxxxxx' \
  --region us-east-1

aws secretsmanager create-secret \
  --name accesly/dev/dynerox-prod-key \
  --secret-string 'sk_live_xxxxxxxxx' \
  --region us-east-1

aws secretsmanager create-secret \
  --name accesly/dev/dynerox-webhook-secret \
  --secret-string 'whsec_xxxxxxxxx' \
  --region us-east-1
```

## Paso 2: Cliente Dynerox

Crear `CloudServices-accesly/lambdas/shared/src/dynerox-client.ts`:

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { Network } from './network-config.js';

const sm = new SecretsManagerClient({});

const keyCache = new Map<Network, { key: string; expiresAt: number }>();
const TTL_MS = 300_000; // 5 min

async function getDyneroxKey(network: Network): Promise<string> {
  const cached = keyCache.get(network);
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  const secretName = network === 'mainnet'
    ? process.env.DYNEROX_PROD_KEY_ARN
    : process.env.DYNEROX_SANDBOX_KEY_ARN;

  const resp = await sm.send(new GetSecretValueCommand({ SecretId: secretName }));
  const key = resp.SecretString!;
  keyCache.set(network, { key, expiresAt: Date.now() + TTL_MS });
  return key;
}

function baseUrl(network: Network): string {
  return network === 'mainnet'
    ? 'https://api.dynerox.com' // Confirmar con Dynerox
    : 'https://api-stage.dynerox.com';
}

export class DyneroxClient {
  constructor(private readonly network: Network) {}

  private async fetch(path: string, opts: { method?: string; body?: any } = {}) {
    const key = await getDyneroxKey(this.network);
    const url = baseUrl(this.network) + path;
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        'x-api-key': key,
        'Content-Type': 'application/json',
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Dynerox ${opts.method ?? 'GET'} ${path} failed ${res.status}`);
    }
    return res.json();
  }

  createUser(input: CreateUserInput) {
    return this.fetch('/v1/public/users', { method: 'POST', body: input });
  }
  getUser(userId: string) {
    return this.fetch(`/v1/public/users/${userId}`);
  }
  registerBankAccount(input: CreateBankAccountInput) {
    return this.fetch('/v1/public/beneficiary-accounts', { method: 'POST', body: input });
  }
  createRoute(input: CreateRouteInput) {
    return this.fetch('/v1/public/routes', { method: 'POST', body: input });
  }
  listRoutes(userId: string) {
    return this.fetch(`/v1/public/routes?user_id=${userId}`);
  }
  lookupBank(clabeId: string) {
    return this.fetch(`/v1/public/banks/clabe/${clabeId}`);
  }
  registerWebhook(input: { url: string; events: string[] }) {
    return this.fetch('/v1/public/webhooks', { method: 'POST', body: input });
  }
}

// Types (extraidos de OpenAPI de Dynerox)
export interface CreateUserInput {
  first_name: string;
  middle_name?: string;
  last_name: string;
  second_last_name?: string;
  email: string;
  curp: string;
  phone?: string;
}
export interface CreateBankAccountInput {
  user_id: string;
  clabe: string;
  currency: string; // "MXN"
  network: string;  // "SPEI"
}
export interface CreateRouteInput {
  user_id: string;
  from: {
    currency: { symbol: string };
    network: { name: string };
  };
  to: {
    currency: { symbol: string };
    network: { name: string };
    account: string;
    bank_account_id?: string;
  };
}
export interface RouteResponse {
  route_id: string;
  status: 'pending_identity' | 'pending_authorization' | 'active' | 'inactive';
  authorization_url: string | null;
  from: any;
  to: any;
  created_at: string;
  updated_at: string;
}
```

## Paso 3: Nuevo campo en `user_fragments`

Editar `CloudServices-accesly/lambdas/shared/src/types.ts`:

- [ ] Agregar `dyneroxUserId?: string` y `dyneroxKycStatus?: string` al type `UserFragmentRecord`.

Script one shot para backfill:

```javascript
// scripts/backfill-dynerox-fields.mjs
// Setear defaults en todos los rows existentes
// dyneroxUserId: null
// dyneroxKycStatus: 'not-started'
```

## Paso 4: Refactor de la Lambda KYC

Renombrar `lambdas/etherfuse-kyc/` a `lambdas/dynerox-kyc/`.

Nuevo handler:

```typescript
// lambdas/dynerox-kyc/src/handler.ts
import { DyneroxClient } from '@accesly/lambdas-shared/dynerox-client';
import { getAppConfig, getAppNetwork } from '@accesly/lambdas-shared/app-configs';

export async function handleRegister(event) {
  const jwt = extractJwt(event);
  const { appId, sub: userId } = decodeJwt(jwt);
  const appConfig = await getAppConfig(appId);
  const network = getAppNetwork(appConfig);
  const dynerox = new DyneroxClient(network);

  const body = JSON.parse(event.body);
  // Validar CURP + CLABE + demás datos

  const user = await dynerox.createUser({
    first_name: body.firstName,
    middle_name: body.middleName,
    last_name: body.paternalLastName,
    second_last_name: body.maternalLastName,
    email: body.email,
    curp: body.holderCurp,
    phone: body.phone,
  });

  // Registrar CLABE
  const bankAccount = await dynerox.registerBankAccount({
    user_id: user.user_id,
    clabe: body.clabe,
    currency: 'MXN',
    network: 'SPEI',
  });

  // Guardar dyneroxUserId en user_fragments
  await ddb.send(new UpdateCommand({
    TableName: process.env.USER_FRAGMENTS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET dyneroxUserId = :u, dyneroxKycStatus = :s',
    ExpressionAttributeValues: {
      ':u': user.user_id,
      ':s': 'pending_identity',
    },
  }));

  return jsonResponse(200, {
    dyneroxUserId: user.user_id,
    kycStatus: 'pending_identity',
    bankAccountId: bankAccount.bank_account_id,
  });
}

export async function handleStatus(event) {
  const jwt = extractJwt(event);
  const { appId, sub: userId } = decodeJwt(jwt);
  // Leer dyneroxUserId de user_fragments, hacer GET a Dynerox
  // Devolver { status, authorizationUrl }
}
```

## Paso 5: Refactor de la Lambda order (on ramp + off ramp)

Renombrar `lambdas/etherfuse-order/` a `lambdas/dynerox-order/`.

```typescript
export async function handleOnRamp(event) {
  const jwt = extractJwt(event);
  const { appId, sub: userId } = decodeJwt(jwt);
  const appConfig = await getAppConfig(appId);
  const network = getAppNetwork(appConfig);
  const dynerox = new DyneroxClient(network);

  // Leer user_fragments para obtener walletAddress + dyneroxUserId
  const fragment = await getUserFragmentRecord(userId);
  if (!fragment.dyneroxUserId) throw new Error('KYC_NOT_STARTED');

  const body = JSON.parse(event.body);

  const route = await dynerox.createRoute({
    user_id: fragment.dyneroxUserId,
    from: {
      currency: { symbol: 'mxn' },
      network: { name: 'spei' },
    },
    to: {
      currency: { symbol: 'usdc' },
      network: { name: 'stellar' },
      account: fragment.walletAddress,
    },
  });

  return jsonResponse(200, {
    routeId: route.route_id,
    status: route.status,
    authorizationUrl: route.authorization_url,
  });
}
```

## Paso 6: Webhook handler nuevo

Crear `lambdas/dynerox-webhook/src/handler.ts`:

```typescript
import crypto from 'crypto';

export async function handler(event) {
  const secret = await getWebhookSecret(); // De Secrets Manager
  const signature = event.headers['x-webhook-signature'];
  const body = event.body;

  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (signature !== expected) {
    return jsonError(401, 'Invalid signature');
  }

  const evt = JSON.parse(body);
  switch (evt.event) {
    case 'user.created':
    case 'user.updated':
      // Update user_fragments.dyneroxKycStatus si aplica
      break;
    case 'kyc.completed':
      await markKycActive(evt.data.user_id);
      break;
    default:
      console.log('Unknown event:', evt.event);
  }
  return jsonResponse(200, { received: true });
}
```

## Paso 7: Poll de routes (workaround por falta de webhook)

Dynerox actualmente no dispara webhook cuando una route completa. Poll con EventBridge cron cada 30s:

Crear `lambdas/dynerox-poll-routes/src/handler.ts`:

```typescript
export async function handler() {
  // Query DDB por routes en pending_authorization
  // Para cada una, GET Dynerox status
  // Si cambio, actualizar row + trigger notification al user (opcional)
}
```

CDK: agregar EventBridge rule con schedule `rate(30 seconds)`.

## Paso 8: CDK actualizar Lambdas stack

Editar `infra/lib/lambdas-stack.ts`:

- [ ] Reemplazar `etherfuseKycFn`, `etherfuseOrderFn`, `etherfuseWebhookFn` por `dyneroxKycFn`, `dyneroxOrderFn`, `dyneroxWebhookFn`, `dyneroxPollRoutesFn`
- [ ] Grant read a los 3 secrets nuevos:

```typescript
dyneroxKeySandboxSecret.grantRead(this.dyneroxKycFn);
dyneroxKeyProdSecret.grantRead(this.dyneroxKycFn);
dyneroxWebhookSecret.grantRead(this.dyneroxWebhookFn);
```

- [ ] EventBridge rule para el poll routes

## Paso 9: API Gateway routes

Actualizar `infra/lib/rest-api-stack.ts` (o donde estén las routes):

- [ ] `POST /kyc/register-bank-account` → dyneroxKycFn
- [ ] `GET /kyc/status` → dyneroxKycFn
- [ ] `POST /onramp` → dyneroxOrderFn
- [ ] `POST /offramp` → dyneroxOrderFn
- [ ] `POST /webhooks/dynerox` → dyneroxWebhookFn (público, sin JWT)

## Paso 10: Registrar webhook con Dynerox

One shot manual:

```bash
curl -X POST https://api-stage.dynerox.com/v1/public/webhooks \
  -H "x-api-key: sk_test_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.accesly.xyz/webhooks/dynerox",
    "events": ["user.created", "user.updated", "kyc.completed"]
  }'
```

Guardar el `secret` del response en Secrets Manager `accesly/dev/dynerox-webhook-secret`.

Repetir para producción con `sk_live_*`.

## Paso 11: Cleanup del Etherfuse

Después de que Dynerox funcione end to end, borrar:

- [ ] `lambdas/etherfuse-kyc/`
- [ ] `lambdas/etherfuse-order/`
- [ ] `lambdas/etherfuse-webhook/`
- [ ] `lambdas/shared/src/etherfuse-client.ts`
- [ ] Referencias en `lambdas/shared/src/types.ts` a `provider: 'etherfuse'`

## Criterio de done

- Backfill de `dyneroxUserId` y `dyneroxKycStatus` en todos los `user_fragments` existentes
- CDK deploy exitoso con las 4 Lambdas nuevas (kyc, order, webhook, poll-routes)
- Test manual sandbox: register user + register CLABE + start onramp → devuelve authorization_url válida
- Test manual: click en authorization_url, completar liveness en Dynerox sandbox, USDC llega a la wallet Stellar testnet
- Webhook llega, signature verificada, DDB updateado
- Etherfuse code eliminado del repo

## Riesgos

- **Diferencias schema Dynerox vs Etherfuse**: los tipos SDK cambian (Fase 6). Coordinar con integradores existentes si hay migración de users. En el caso de Accesly hoy, no hay users en prod, entonces free rein.
- **CURP required**: usuarios no mexicanos quedan bloqueados. Ver la doc pública `accesly.xyz/docs/kyc-fiat` para el mensaje al user.
- **Webhook secret expiration**: si Dynerox rota los webhooks, hay que updatear el Secret Manager. Documentar el procedimiento.

## Notas

Ninguna todavía.
