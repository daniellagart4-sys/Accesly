# Fase 6: SDK Adapters Multi Network + Dynerox

Actualizar `@accesly/react` y `@accesly/core` para exponer network en el appConfig, threading a explorer URLs y warnings de mainnet, tipos Dynerox, hook `useKyc`, y bump de version.

Duración estimada: 4 a 5 días.

## Prerequisitos

- Fase 4 completada: backend soporta multi network via appConfig.
- Fase 5 completada: backend expone endpoints Dynerox `/kyc/*`, `/onramp`, `/offramp`.
- Repo `SDKAccesly` local.

## Paso 1: Bump version

Editar `packages/react/package.json`:

```json
"version": "2.6.0"
```

Editar `packages/core/package.json`:

```json
"version": "1.21.0"
```

## Paso 2: Refactor `ENVIRONMENT_DEFAULTS`

Editar `SDKAccesly/packages/react/src/config.ts` líneas 40-96.

Cambiar la estructura para que cada env tenga sub configs por network:

```typescript
export const ENVIRONMENT_DEFAULTS = {
  dev: {
    apiUrl: 'https://w4kwws8fa6.execute-api.us-east-1.amazonaws.com/dev',
    stellar: {
      testnet: {
        networkPassphrase: 'Test SDF Network ; September 2015',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
        deployerAddress: 'GDRHSVLY3VCEHCHCSR5MZR2ALYLCERDDFT3ULCUIELGFVYHTZFCMNU4E',
        explorerBase: 'https://stellar.expert/explorer/testnet',
      },
      mainnet: {
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
        horizonUrl: 'https://horizon.stellar.org',
        sorobanRpcUrl: 'https://soroban-mainnet.stellar.org',
        deployerAddress: '<pubkey de accesly-deployer-mainnet>',
        explorerBase: 'https://stellar.expert/explorer/public',
      },
    },
  },
  staging: { /* idem */ },
  prod: { /* idem */ },
} as const;
```

Y exportar helper:

```typescript
export function getStellarDefaults(env: Environment, network: Network) {
  return ENVIRONMENT_DEFAULTS[env].stellar[network];
}
```

## Paso 3: Agregar `network` al AppConfigResponse

Editar `SDKAccesly/packages/core/src/types/app-config.ts` líneas 121+:

```typescript
export interface AppConfigResponse {
  appId: string;
  appName: string;
  network: 'testnet' | 'mainnet';  // NUEVO
  branding?: AppConfigBranding;
  trustlines?: ReadonlyArray<AppConfigTrustline>;
  cognito?: { userPoolId: string; clientId: string };
  auth?: { providers: string[] };
  // ...
}
```

Actualizar cualquier zod validator o parser que valide el schema.

## Paso 4: Refactor `useAppConfig` para exponer network

Editar `SDKAccesly/packages/react/src/hooks/useAppConfig.ts`.

Asegurar que el hook devuelve el field `network` del response:

```typescript
return {
  appConfig,       // ahora tiene .network
  status,
  error,
  refetch,
};
```

## Paso 5: Nuevo hook `useNetwork`

Crear `SDKAccesly/packages/react/src/hooks/useNetwork.ts`:

```typescript
import { useAppConfig } from './useAppConfig.js';
import type { Network } from '@accesly/core';

export function useNetwork(): Network | undefined {
  const { appConfig } = useAppConfig();
  return appConfig?.network;
}
```

Export en `packages/react/src/index.ts`.

## Paso 6: Explorer URLs con network real

Editar `SDKAccesly/packages/core/src/stellar/format.ts` líneas 95-111:

- Cambiar los defaults de `network = 'testnet'` a `network` sin default (requerido)
- Callers en el kit deben pasar el network explícito

En `packages/react/src/kit/`, buscar cada uso de:

- `walletExplorerUrl(address, ...)`
- `txExplorerUrl(txHash, ...)`
- `accountExplorerUrl(address, ...)`

Y agregar el network via `useNetwork()`:

```typescript
const network = useNetwork();
// ...
const explorer = network ? txExplorerUrl(txHash, network) : '';
```

Componentes a tocar (grep primero):

- [ ] `SwapFlow.tsx`
- [ ] `SendFlow.tsx`
- [ ] `MovementsList.tsx`
- [ ] `WalletHome.tsx`
- [ ] `RecoveryFlow.tsx`
- [ ] `BalanceCard.tsx`

## Paso 7: Componente `<NetworkBadge>`

Crear `packages/react/src/kit/NetworkBadge.tsx`:

```typescript
import { useNetwork } from '../hooks/useNetwork.js';

export function NetworkBadge() {
  const network = useNetwork();
  if (!network) return null;

  const isMainnet = network === 'mainnet';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 100,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        background: isMainnet ? 'rgba(167, 139, 250, 0.12)' : 'rgba(160, 160, 170, 0.12)',
        color: isMainnet ? 'var(--accesly-primary, #a78bfa)' : 'var(--accesly-muted, #71717a)',
        border: `1px solid ${isMainnet ? 'rgba(167, 139, 250, 0.25)' : 'rgba(160, 160, 170, 0.15)'}`,
      }}
    >
      {network}
    </span>
  );
}
```

Renderizar en `WalletHome` en la esquina superior derecha.

## Paso 8: Modal de confirmación en mainnet

En `SwapFlow.tsx`, `SendFlow.tsx`, agregar checkbox de confirmación cuando `useNetwork() === 'mainnet'`:

```typescript
const network = useNetwork();

if (network === 'mainnet' && !confirmed) {
  return (
    <ConfirmMainnetModal
      onConfirm={() => setConfirmed(true)}
      onCancel={onCancel}
    />
  );
}
```

## Paso 9: Tipos Dynerox

Reemplazar tipos Etherfuse en `packages/core/src/types/api.ts` líneas 416-561:

```typescript
export interface RegisterBankAccountRequest {
  clabe: string;              // 18 dígitos
  firstName: string;
  middleName?: string;
  paternalLastName: string;
  maternalLastName?: string;
  holderCurp: string;         // 18 chars
  birthDate: string;          // YYYY-MM-DD
  phone?: string;             // E.164
  email: string;
}

export interface RegisterBankAccountResponse {
  dyneroxUserId: string;
  bankAccountId: string;
  kycStatus: KycStatus;
}

export type KycStatus =
  | 'not-started'
  | 'pending_identity'
  | 'pending_authorization'
  | 'active'
  | 'inactive';

export interface OrderRequest {
  amount: string;  // Monto en MXN para onramp, en USDC para offramp
  currency: 'MXN' | 'USDC';
  bankAccountId?: string; // Solo offramp
}

export interface OrderResponse {
  routeId: string;
  status: KycStatus;
  authorizationUrl: string | null;
}
```

## Paso 10: Nuevo hook `useKyc`

Crear `packages/react/src/hooks/useKyc.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { useAccesly } from './useAccesly.js';
import type { KycStatus } from '@accesly/core';

export interface UseKycResult {
  status: KycStatus | 'loading';
  authorizationUrl?: string;
  refetch: () => Promise<void>;
}

export function useKyc(): UseKycResult {
  const { fiat, auth } = useAccesly();
  const [status, setStatus] = useState<KycStatus | 'loading'>('loading');
  const [url, setUrl] = useState<string | undefined>(undefined);

  const refetch = useCallback(async () => {
    if (auth.status !== 'authenticated') {
      setStatus('not-started');
      return;
    }
    const resp = await fiat.checkStatus();
    setStatus(resp.status);
    setUrl(resp.authorizationUrl ?? undefined);
  }, [fiat, auth.status]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { status, authorizationUrl: url, refetch };
}
```

Export en `packages/react/src/index.ts`.

## Paso 11: Refactor `<AddFundsFlow>`

Editar `packages/react/src/kit/AddFundsFlow.tsx`:

- [ ] Usar `useKyc()` para determinar si el user necesita KYC primero
- [ ] Si `status === 'not-started'`, render formulario KYC (CLABE + CURP + demás)
- [ ] Si `status === 'pending_identity'`, abrir `authorizationUrl` en modal o redirect
- [ ] Si `status === 'active'`, render input de monto y disparar `fiat.startOnRamp(...)`
- [ ] Poll `useKyc.refetch()` cada 30s mientras esté en pending

## Paso 12: Refactor `<CreateWalletFlow>` con warning mainnet

Editar `packages/react/src/kit/CreateWalletFlow.tsx`:

- [ ] Detectar `useNetwork() === 'mainnet'` en el step 'intro'
- [ ] Si mainnet, agregar mensaje "Vas a crear una wallet MAINNET. Los fondos son reales."
- [ ] Chequear checkbox "Entiendo" antes de habilitar el botón "Crear mi wallet"

## Paso 13: SDK build + typecheck

```bash
cd SDKAccesly/packages/core
pnpm build

cd ../react
pnpm build
pnpm typecheck
```

Fix cualquier type error causado por el cambio de shape.

## Paso 14: Pack tarball para vendoring

```bash
cd SDKAccesly/packages/react
pnpm pack
```

Output: `accesly-react-2.6.0.tgz`.

Copiar a los repos que lo consumen:

```bash
cp packages/react/accesly-react-2.6.0.tgz ../accesly-example/vendor/
cp packages/react/accesly-react-2.6.0.tgz ../Accesly/Frontend/vendor/
```

Actualizar `package.json` en accesly-example y Frontend para apuntar al nuevo tarball. `pnpm install --force`.

## Paso 15: Actualizar CHANGELOG

Editar `packages/react/CHANGELOG.md` con entry 2.6.0 documentando:

- useAppConfig ahora expone network
- Nuevo hook useNetwork
- Nuevo hook useKyc
- Explorer URLs con network correcto
- Warning modals en mainnet
- Tipos Dynerox reemplazan Etherfuse
- Nuevo componente NetworkBadge

## Paso 16: Publicar a npm (opcional pero recomendado)

```bash
cd packages/core
pnpm publish --access public

cd ../react
pnpm publish --access public
```

Ver que aparezcan en `npmjs.com/package/@accesly/react` y `@accesly/core`.

## Criterio de done

- SDK 2.6.0 pack'd y consumible localmente en Frontend + accesly-example
- Test manual: app testnet muestra badge "TESTNET" gris, no muestra warning al swap
- Test manual: app mainnet muestra badge "MAINNET" lavanda, modal de confirmación pre swap
- `useKyc()` devuelve el status correcto según el user
- `<AddFundsFlow />` orquesta KYC + onramp end to end
- Explorer URLs apuntan al explorer correcto según network
- Zero regresiones en apps testnet existentes

## Riesgos

- **Breaking change en tipos**: cualquier integrador que dependa de los tipos Etherfuse va a romper. En este momento no hay integradores externos, entonces es tolerable. Documentar en CHANGELOG.
- **Explorer URLs**: si un caller olvida pasar network, explorer URL queda mal. Considerar hacer el param requerido en TypeScript.

## Notas

Ninguna todavía.
