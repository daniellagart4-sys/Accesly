# Fase 4: Lambdas Multi Network Refactor

Refactor de 12 Lambdas que hoy asumen una sola network. Cada Lambda debe leer el network del `appConfig` del user y rutear al RPC + KMS key + contract addresses correctos.

Duración estimada: 3 a 4 días.

## Prerequisitos

- Fase 3 completada: KMS keys mainnet configuradas, contract addresses registradas en DDB.
- Repo `CloudServices-accesly` local.

## Cambio conceptual

Hoy:

```typescript
// Lambda arranca leyendo STELLAR_NETWORK del env var
const rpc = new SorobanRpc.Server(process.env.SOROBAN_RPC_URL);
```

Después:

```typescript
// Lambda lee network del appConfig del user por request
const appConfig = await getAppConfig(appIdFromJwt);
const network = getAppNetwork(appConfig);
const stellar = getStellarConfig(network);
const rpc = new SorobanRpc.Server(stellar.sorobanRpcUrl);
```

## Paso 1: Helper module `network-config.ts`

Crear `CloudServices-accesly/lambdas/shared/src/network-config.ts`:

```typescript
export type Network = 'testnet' | 'mainnet';

export interface StellarNetworkConfig {
  readonly network: Network;
  readonly sorobanRpcUrl: string;
  readonly horizonUrl: string;
  readonly passphrase: string;
  readonly relayerKmsKeyId: string;
  readonly relayerAddress: string;
  readonly channelsKmsKeyId: string | undefined;
  readonly channelsAddress: string | undefined;
  readonly explorerBase: string;
}

export function getStellarConfig(network: Network): StellarNetworkConfig {
  if (network === 'mainnet') {
    return {
      network,
      sorobanRpcUrl: 'https://soroban-mainnet.stellar.org',
      horizonUrl: 'https://horizon.stellar.org',
      passphrase: 'Public Global Stellar Network ; September 2015',
      relayerKmsKeyId: requireEnv('RELAYER_FUND_MAINNET_KMS_KEY_ID'),
      relayerAddress: requireEnv('RELAYER_FUND_MAINNET_ADDRESS'),
      channelsKmsKeyId: process.env.CHANNELS_FUND_MAINNET_KMS_KEY_ID,
      channelsAddress: process.env.CHANNELS_FUND_MAINNET_ADDRESS,
      explorerBase: 'https://stellar.expert/explorer/public',
    };
  }
  // testnet
  return {
    network,
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
    relayerKmsKeyId: requireEnv('RELAYER_FUND_TESTNET_KMS_KEY_ID'),
    relayerAddress: requireEnv('RELAYER_FUND_TESTNET_ADDRESS'),
    channelsKmsKeyId: process.env.CHANNELS_FUND_TESTNET_KMS_KEY_ID,
    channelsAddress: process.env.CHANNELS_FUND_TESTNET_ADDRESS,
    explorerBase: 'https://stellar.expert/explorer/testnet',
  };
}
```

## Paso 2: Contract registry cache

Crear `CloudServices-accesly/lambdas/shared/src/contract-registry.ts`:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Network } from './network-config.js';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface ContractRegistry {
  readonly wasmHash: string;
  readonly ed25519Verifier: string;
  readonly secp256r1Verifier: string;
  readonly spendingLimit: string;
  readonly sessionKey: string;
  readonly upgradeRule: string;
  readonly governance: string;
  readonly usdcSac: string;
  readonly usdcIssuer: string;
}

const cache = new Map<Network, { data: ContractRegistry; expiresAt: number }>();
const TTL_MS = 60_000;

export async function getContracts(network: Network): Promise<ContractRegistry> {
  const cached = cache.get(network);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const resp = await ddb.send(new QueryCommand({
    TableName: process.env.CONTRACT_VERSIONS_TABLE,
    IndexName: 'by-network-status',
    KeyConditionExpression: 'network = :n AND #s = :active',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':n': network, ':active': 'active' },
    Limit: 1,
    ScanIndexForward: false,
  }));

  if (!resp.Items || resp.Items.length === 0) {
    throw new Error(`No active contract version found for network=${network}`);
  }

  const item = resp.Items[0] as { wasmHash: string; contractAddresses: any };
  const registry: ContractRegistry = {
    wasmHash: item.wasmHash,
    ...item.contractAddresses,
  };
  cache.set(network, { data: registry, expiresAt: Date.now() + TTL_MS });
  return registry;
}
```

## Paso 3: Helper para leer network del appConfig

Editar `CloudServices-accesly/lambdas/shared/src/app-configs.ts`. Agregar función:

```typescript
export function getAppNetwork(config: AppConfig): Network {
  const networks = config.networks;
  if (networks?.mainnet && !networks?.testnet) return 'mainnet';
  if (networks?.testnet && !networks?.mainnet) return 'testnet';
  // Default: testnet si ambiguo o vacío (backward compat)
  return 'testnet';
}
```

## Paso 4: Refactor de las 12 Lambdas

Cada Lambda que instancia `SorobanRpc.Server` o construye tx Stellar debe:

1. Leer el `appId` del JWT del user (o del body si el endpoint es público)
2. Cargar `appConfig` con `getAppConfig(appId)`
3. Determinar network con `getAppNetwork(appConfig)`
4. Cargar stellar config y contracts

Patrón repetido:

```typescript
import { getAppConfig, getAppNetwork } from '@accesly/lambdas-shared';
import { getStellarConfig } from '@accesly/lambdas-shared/network-config';
import { getContracts } from '@accesly/lambdas-shared/contract-registry';

async function handleRequest(event: APIGatewayProxyEvent) {
  const appId = event.requestContext.authorizer?.claims?.appId; // O como esté
  const appConfig = await getAppConfig(appId);
  const network = getAppNetwork(appConfig);
  const stellar = getStellarConfig(network);
  const contracts = await getContracts(network);

  const rpc = new SorobanRpc.Server(stellar.sorobanRpcUrl);
  // ... resto del handler usando stellar.passphrase, contracts.usdcSac, etc.
}
```

Lambdas a refactorear (paths file:line):

- [ ] `lambdas/create-wallet/src/handler.ts:38-50` — usar `stellar.passphrase` en `buildSmartAccountDeployTx`, `contracts.wasmHash`, `contracts.ed25519Verifier`, etc.
- [ ] `lambdas/activate-asset/src/handler.ts`
- [ ] `lambdas/simulate-tx/src/handler.ts`
- [ ] `lambdas/submit-tx/src/handler.ts:41-60` — fee bump con `stellar.relayerKmsKeyId`
- [ ] `lambdas/swap/src/handler.ts`
- [ ] `lambdas/swap-sdex/src/handler.ts` — usa `stellar.channelsKmsKeyId` también
- [ ] `lambdas/bootstrap-g/src/handler.ts`
- [ ] `lambdas/sweep-g/src/handler.ts`
- [ ] `lambdas/trustlines-g-add/src/handler.ts`
- [ ] `lambdas/wallet-data/src/handler.ts` — read only pero necesita `stellar.sorobanRpcUrl`
- [ ] `lambdas/wallet-stream/src/handler.ts` — SSE stream, mismo RPC
- [ ] `lambdas/wallet-upgrade/src/handler.ts`
- [ ] `lambdas/recovery-otp/src/finalize.ts` — `rotate_signer` on chain

## Paso 5: Cache in memory por container Lambda

`getAppConfig` ya tiene cache. Aumentar TTL a 60 segundos para reducir DDB reads en request path.

Editar `lambdas/shared/src/app-configs.ts` si el TTL actual es menor.

## Paso 6: Audit logs con network dimension

Cada write a `audit_logs` DDB table debe incluir `network`. Grep `recordAudit(` en el codebase y agregar el field.

```typescript
await recordAudit({
  appId,
  userId,
  action: 'wallet_created',
  result: 'success',
  network, // NUEVO
  metadata: { walletAddress },
});
```

## Paso 7: Enforcement al crear un app

Editar `lambdas/apps/src/handler.ts` en el POST `/apps` handler:

- [ ] Validar: solo UN network activo. Rechazar body con `{ networks: { testnet: true, mainnet: true } }` con error 400 "Selecciona una network única".
- [ ] Validar: en PATCH, si el user cambia network Y ya hay wallets creadas para ese app, rechazar con 409. Query: `user_fragments` GSI `by-app-time` con `Limit: 1`. Si devuelve algo, negar el cambio.

## Paso 8: Deploy incremental

Deploy Lambda por Lambda (no todas de golpe). Empezar con las de menor riesgo:

1. `wallet-data` (read only, fácil rollback)
2. `simulate-tx` (no submitea)
3. `create-wallet` (crítica pero test manual antes)
4. Resto en orden

Después de cada deploy, esperar 10 minutos, revisar CloudWatch para errores nuevos, y solo entonces continuar.

## Criterio de done

- Todas las 12 Lambdas refactoreadas con `getAppConfig → getAppNetwork → getStellarConfig`
- Test manual: crear app testnet + crear wallet → funciona idem que antes
- Test manual: crear app mainnet + intentar crear wallet → wallet mainnet aparece en stellar.expert public
- Audit logs incluyen field `network` (verificar con query de DDB)
- Enforcement de single network al crear/editar app funciona
- CloudWatch: cero errores nuevos vs baseline pre refactor

## Riesgos

- **Cross network contamination**: si un Lambda lee network mal (ej. bug en `getAppNetwork`), puede firmar tx testnet con relayer mainnet key o al revés. Impacto: fondos perdidos irreversible. Mitigación: tests unitarios de `getAppNetwork` con inputs edge case, y assertion en el helper `getStellarConfig` que el passphrase matchee el network que devuelve.
- **App con `networks` vacío**: el default es testnet. Verificar backfill del script one shot de la Fase 5 (agregar `networks.testnet=true` a todos los rows existentes).
- **Performance**: cada request agrega 1 DDB read (getAppConfig). Con cache 60s, es aceptable. Si algún endpoint queda muy chill, subir TTL o agregar CloudFront.

## Notas

Ninguna todavía.
