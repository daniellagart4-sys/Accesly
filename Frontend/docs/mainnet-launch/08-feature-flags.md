# Fase 8: Feature Flags y Kill Switch

Sistema de feature flags para pausar mainnet en < 30 segundos si hay incidente. Es la red de seguridad principal en ausencia de audit externo formal.

Duración estimada: 2 a 3 días.

## Prerequisitos

- Fase 4 completada: Lambdas leen network del appConfig.
- Fase 7 completada: dashboard tiene placeholder de admin flags page.

## Paso 1: Nueva tabla DDB `feature_flags`

Editar `CloudServices-accesly/infra/lib/data-stack.ts` agregando la table:

```typescript
this.featureFlagsTable = new dynamodb.Table(this, 'FeatureFlags', {
  tableName: `accesly-${stage}-feature-flags`,
  partitionKey: { name: 'flag_name', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
```

Exponer en el output del stack para consumo por Lambdas.

## Paso 2: Flags iniciales

Crear script `CloudServices-accesly/scripts/bootstrap-feature-flags.mjs`:

```javascript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

const flags = [
  { flag_name: 'mainnet_enabled_global', value_type: 'boolean', enabled: true, description: 'Master kill switch for all mainnet operations' },
  { flag_name: 'mainnet_new_wallets_enabled', value_type: 'boolean', enabled: true, description: 'Allow creation of new wallets on mainnet' },
  { flag_name: 'mainnet_onramp_enabled', value_type: 'boolean', enabled: true, description: 'Allow Dynerox on ramp on mainnet' },
  { flag_name: 'mainnet_offramp_enabled', value_type: 'boolean', enabled: true, description: 'Allow Dynerox off ramp on mainnet' },
  { flag_name: 'mainnet_swap_enabled', value_type: 'boolean', enabled: true, description: 'Allow swaps XLM/USDC on mainnet' },
  { flag_name: 'mainnet_max_wallet_value_usd', value_type: 'number', value: 100, description: 'Max USD equivalent per wallet on mainnet' },
];

for (const flag of flags) {
  await ddb.send(new PutCommand({
    TableName: 'accesly-dev-feature-flags',
    Item: { ...flag, updatedAt: new Date().toISOString() },
  }));
  console.log('Bootstrapped:', flag.flag_name);
}
```

## Paso 3: Helper `feature-flags.ts`

Crear `CloudServices-accesly/lambdas/shared/src/feature-flags.ts`:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface FeatureFlag {
  flag_name: string;
  value_type: 'boolean' | 'number' | 'string';
  enabled?: boolean;
  value?: number | string;
}

const cache = new Map<string, { flag: FeatureFlag; expiresAt: number }>();
const TTL_MS = 30_000;

export async function getFlag(name: string): Promise<FeatureFlag> {
  const cached = cache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.flag;

  const resp = await ddb.send(new GetCommand({
    TableName: process.env.FEATURE_FLAGS_TABLE,
    Key: { flag_name: name },
  }));

  if (!resp.Item) throw new Error(`Feature flag not found: ${name}`);
  const flag = resp.Item as FeatureFlag;
  cache.set(name, { flag, expiresAt: Date.now() + TTL_MS });
  return flag;
}

export async function assertFlagEnabled(name: string): Promise<void> {
  const flag = await getFlag(name);
  if (flag.value_type !== 'boolean' || !flag.enabled) {
    throw new ServiceUnavailableError(`Feature "${name}" is currently disabled`);
  }
}

export class ServiceUnavailableError extends Error {
  readonly statusCode = 503;
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}
```

## Paso 4: Middleware en Lambdas mainnet

Cada Lambda que ejecuta operaciones mainnet debe chequear los flags relevantes al empezar:

```typescript
// create-wallet
const network = getAppNetwork(appConfig);
if (network === 'mainnet') {
  await assertFlagEnabled('mainnet_enabled_global');
  await assertFlagEnabled('mainnet_new_wallets_enabled');
}
```

Ubicaciones específicas:

- [ ] `lambdas/create-wallet/src/handler.ts`: check `mainnet_enabled_global` + `mainnet_new_wallets_enabled` si network=mainnet
- [ ] `lambdas/swap/src/handler.ts`: check `mainnet_enabled_global` + `mainnet_swap_enabled`
- [ ] `lambdas/swap-sdex/src/handler.ts`: idem swap
- [ ] `lambdas/dynerox-order/src/handler.ts`: check `mainnet_onramp_enabled` (o `mainnet_offramp_enabled` según direction)
- [ ] `lambdas/submit-tx/src/handler.ts`: check `mainnet_enabled_global` universal

Errores 503 devueltos incluyen mensaje descriptivo para que el user entienda que es temporal.

## Paso 5: Cap de wallet value

Nueva Lambda helper que chequea antes de operaciones de valor:

```typescript
// lambdas/shared/src/wallet-cap.ts
export async function assertWithinMainnetCap(
  walletAddress: string,
  operationValueUsd: number
): Promise<void> {
  const flag = await getFlag('mainnet_max_wallet_value_usd');
  if (flag.value_type !== 'number') return;
  const cap = flag.value as number;

  // Query balance actual del wallet + valor de la operación
  const currentValue = await getWalletValueUsd(walletAddress);
  if (currentValue + operationValueUsd > cap) {
    throw new Error(`Wallet cap exceeded: ${currentValue + operationValueUsd} > ${cap}`);
  }
}
```

Aplicar en `onramp` y `swap` (donde el user puede aumentar el balance). Send + swap dentro del mismo user no aumenta valor total, así que no hace falta.

## Paso 6: Lambda `feature-flags` para admin

Crear `CloudServices-accesly/lambdas/feature-flags/src/handler.ts`:

```typescript
export async function handleGet(event) {
  // Verificar developer JWT + owner de Accesly Core
  await verifyAcceslyCoreOwner(event);

  const resp = await ddb.send(new ScanCommand({
    TableName: process.env.FEATURE_FLAGS_TABLE,
  }));

  return jsonResponse(200, { flags: resp.Items ?? [] });
}

export async function handlePatch(event) {
  await verifyAcceslyCoreOwner(event);

  const flagName = event.pathParameters?.name;
  const body = JSON.parse(event.body);

  const updateExpr: string[] = [];
  const values: Record<string, any> = {};
  if ('enabled' in body) {
    updateExpr.push('enabled = :e');
    values[':e'] = body.enabled;
  }
  if ('value' in body) {
    updateExpr.push('#v = :v');
    values[':v'] = body.value;
  }
  updateExpr.push('updatedAt = :now');
  values[':now'] = new Date().toISOString();

  await ddb.send(new UpdateCommand({
    TableName: process.env.FEATURE_FLAGS_TABLE,
    Key: { flag_name: flagName },
    UpdateExpression: 'SET ' + updateExpr.join(', '),
    ExpressionAttributeNames: 'value' in body ? { '#v': 'value' } : undefined,
    ExpressionAttributeValues: values,
  }));

  return jsonResponse(200, { flag_name: flagName, ...body });
}
```

Rutas en API Gateway:

- `GET /admin/flags` → handleGet
- `PATCH /admin/flags/{name}` → handlePatch

Autorización: JWT del developer pool + custom claim `isAcceslyCore=true`. Crear el claim manualmente en Cognito para tu cuenta principal.

## Paso 7: Admin UI en dashboard

Editar `DashboardAcceslyDev/src/app/(dashboard)/admin/flags/page.tsx` (placeholder de la Fase 7).

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getFlags, patchFlag } from '@/lib/admin';

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState([]);

  useEffect(() => {
    getFlags().then(setFlags);
  }, []);

  async function toggle(flag) {
    if (!confirm(`Cambiar "${flag.flag_name}" a ${!flag.enabled}?`)) return;
    const updated = await patchFlag(flag.flag_name, { enabled: !flag.enabled });
    setFlags(flags.map(f => f.flag_name === flag.flag_name ? updated : f));
  }

  return (
    <div>
      <h1>Feature Flags</h1>
      <table>
        <thead><tr><th>Flag</th><th>Type</th><th>Value</th><th>Actions</th></tr></thead>
        <tbody>
          {flags.map(f => (
            <tr key={f.flag_name}>
              <td>{f.flag_name}<br/><small>{f.description}</small></td>
              <td>{f.value_type}</td>
              <td>
                {f.value_type === 'boolean' ? (f.enabled ? '✓ ON' : '✗ OFF') : f.value}
              </td>
              <td>
                {f.value_type === 'boolean' && (
                  <button onClick={() => toggle(f)}>Toggle</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Reutilizar el design system del dashboard (dark theme, colors).

## Paso 8: Test manual del kill switch

1. En el dashboard, ir a `/admin/flags`
2. Toggle `mainnet_enabled_global` a OFF
3. En un app mainnet, intentar crear wallet → debe devolver 503 "Feature disabled"
4. En un app testnet, intentar crear wallet → funciona normal
5. Toggle back a ON, retry mainnet → funciona

Medir el tiempo total desde toggle hasta que el request devuelve 503. Con cache 30s, debe ser < 30 segundos.

## Paso 9: Documentar procedimiento

Crear `CloudServices-accesly/docs/runbooks/mainnet-kill-switch.md`:

- Cómo activar el kill switch en <30s
- Escalación: quién debe estar en el loop
- Comunicación externa: template de tweet + status page update
- Post mortem: template para el retrospective

## Criterio de done

- Tabla `feature_flags` creada y bootstrapped con 6 flags iniciales
- Cada Lambda mainnet checkea el flag correcto al inicio
- `/admin/flags` accesible solo a Accesly Core, con UI funcional
- Cap de wallet enforceado ($100 default)
- Kill switch verificado: toggle a OFF pausa mainnet < 30s
- Runbook escrito en el repo

## Riesgos

- **Cache stale**: si el TTL es 30s y hay incident, hay ventana de hasta 30s donde algunos containers Lambda usan el flag viejo. Aceptable para MVP. Si necesitás inmediato, bajar TTL a 5s o invalidar via SNS fanout (más complejo).
- **Access control admin**: si el flag `isAcceslyCore` está mal configurado, cualquier developer podría pausar mainnet. Testear con user regular que da 403.

## Notas

Ninguna todavía.
