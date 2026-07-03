# Fase 3: KMS Keys y Registro en DDB

Crear 2 KMS keys nuevas (relayer y channels mainnet), configurar IAM policies para las Lambdas, y registrar los contract addresses de mainnet en la tabla `contract-versions`.

Duración estimada: 4 a 6 horas.

## Prerequisitos

- Fase 2 completada: contratos deployados en mainnet, 3 keypairs mainnet activas.
- Public addresses de las 3 mainnet accounts guardadas.

## Paso 1: Agregar KMS keys al CDK

Editar `CloudServices-accesly/infra/lib/kms-stack.ts`:

- [ ] Después de `this.relayerFundKey`, agregar:

```typescript
this.relayerFundMainnetKey = new kms.Key(this, 'RelayerFundMainnetKey', {
  description: 'Relayer fund signing key for mainnet',
  keySpec: kms.KeySpec.ECC_NIST_P256, // O ECC_SECG_P256K1 según lo que use el existing
  keyUsage: kms.KeyUsage.SIGN_VERIFY,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  alias: `accesly-${stage}-relayer-fund-mainnet`,
});

this.channelsFundMainnetKey = new kms.Key(this, 'ChannelsFundMainnetKey', {
  description: 'Channels fund signing key for mainnet SDEX fee bumps',
  keySpec: kms.KeySpec.ECC_NIST_P256,
  keyUsage: kms.KeyUsage.SIGN_VERIFY,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  alias: `accesly-${stage}-channels-fund-mainnet`,
});
```

**Importante**: los `KeySpec` deben matchear el existing testnet key. Verificar `KmsStack.relayerFundKey` en el archivo para el spec exacto.

- [ ] Exponer las nuevas keys en el output del stack:

```typescript
export class KmsStack extends cdk.Stack {
  public readonly fragmentsKey: kms.IKey;
  public readonly sessionKey: kms.IKey;
  public readonly relayerFundKey: kms.IKey;
  public readonly relayerFundMainnetKey: kms.IKey; // NUEVO
  public readonly channelsFundMainnetKey: kms.IKey; // NUEVO
  // ...
}
```

## Paso 2: Actualizar Lambdas stack para consumir las keys nuevas

Editar `CloudServices-accesly/infra/lib/lambdas-stack.ts`:

- [ ] Agregar env vars nuevos en `commonEnv` (linea 223 aproximadamente):

```typescript
const commonEnv = {
  // ...existing
  RELAYER_FUND_TESTNET_KMS_KEY_ID: props.relayerFundKey.keyId,
  RELAYER_FUND_MAINNET_KMS_KEY_ID: props.relayerFundMainnetKey.keyId,
  RELAYER_FUND_TESTNET_ADDRESS: props.relayerFundAddress,
  RELAYER_FUND_MAINNET_ADDRESS: props.relayerFundAddressMainnet,
  CHANNELS_FUND_MAINNET_KMS_KEY_ID: props.channelsFundMainnetKey.keyId,
  CHANNELS_FUND_MAINNET_ADDRESS: props.channelsFundAddressMainnet,
  // Eliminar STELLAR_NETWORK — ya no aplica multi network
};
```

- [ ] IAM: grant Sign permission a cada Lambda que necesita firmar:

```typescript
props.relayerFundMainnetKey.grantSignVerify(this.createWalletFn.role);
props.relayerFundMainnetKey.grantSignVerify(this.swapFn.role);
props.relayerFundMainnetKey.grantSignVerify(this.swapSdexFn.role);
props.relayerFundMainnetKey.grantSignVerify(this.bootstrapGFn.role);
props.relayerFundMainnetKey.grantSignVerify(this.submitTxFn.role);
props.relayerFundMainnetKey.grantSignVerify(this.recoveryOtpFn.role);
// Idem para channelsFundMainnetKey a las Lambdas de swap-sdex
```

## Paso 3: Deploy CDK

```bash
cd CloudServices-accesly/infra
cdk deploy Accesly-Kms-dev Accesly-Lambdas-dev
```

Verificar que las 2 nuevas keys aparezcan en la consola AWS KMS.

## Paso 4: Importar public keys al KMS (via SDK, no via CLI directo)

Las keys de KMS son asymmetric ECC. La public key la extraés vía SDK:

```bash
aws kms get-public-key \
  --key-id alias/accesly-dev-relayer-fund-mainnet \
  --region us-east-1 \
  --query PublicKey --output text | base64 --decode > relayer-mainnet-pubkey.der
```

Convertir DER a Stellar address con un script Node one shot:

```javascript
// scripts/kms-pubkey-to-stellar.mjs
import fs from 'fs';
import { StrKey } from '@stellar/stellar-sdk';

const der = fs.readFileSync(process.argv[2]);
// Extraer los últimos 32 bytes del DER (que son la ed25519 public key raw)
const pubkeyRaw = der.subarray(der.length - 32);
console.log(StrKey.encodeEd25519PublicKey(pubkeyRaw));
```

Salida esperada: dirección Stellar tipo `G...`. Comparar con la address que generamos en Fase 2 (`accesly-relayer-mainnet`).

**Importante**: si NO matchea, algo se rompió en la generación. No proceder hasta reconciliar.

## Paso 5: Fondear las KMS mainnet addresses

Si en Fase 2 la keypair `accesly-relayer-mainnet` es distinta de la KMS key mainnet, hay que decidir cuál usa el backend.

**Decisión recomendada**: usar la KMS key como signer canónico (no la Stellar CLI key). Razones: KMS ofrece rotación, audit trail, IAM control. La Stellar CLI key era para el deploy inicial de los contratos.

Entonces:

- [ ] Enviar 200 XLM a la dirección derivada de `RelayerFundMainnetKey`
- [ ] Enviar 50 XLM a la dirección derivada de `ChannelsFundMainnetKey`
- [ ] La cuenta `accesly-deployer-mainnet` de la Fase 2 se queda con los 15 XLM que ya tiene (solo se usa para deploys manuales futuros)

## Paso 6: Registrar contract addresses en DDB

La tabla `accesly-dev-contract-versions` ya existe con GSI `by-network-status` (líneas 323-335 de `data-stack.ts`). Solo hay que insertar el row de mainnet.

Crear `CloudServices-accesly/scripts/register-mainnet-contracts.mjs`:

```javascript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

const item = {
  version: 'v3.1.0',
  network: 'mainnet',
  status: 'active',
  wasmHash: '<hash from Fase 2>',
  contractAddresses: {
    ed25519Verifier: '<address>',
    secp256r1Verifier: '<address>',
    spendingLimit: '<address>',
    sessionKey: '<address>',
    upgradeRule: '<address>',
    governance: '<address>',
    usdcSac: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  },
  registeredAt: new Date().toISOString(),
};

await ddb.send(new PutCommand({
  TableName: 'accesly-dev-contract-versions',
  Item: item,
}));

console.log('Registered:', item.version, item.network);
```

Ejecutar:

```bash
node scripts/register-mainnet-contracts.mjs
```

## Paso 7: Verificar via GSI

```bash
aws dynamodb query \
  --table-name accesly-dev-contract-versions \
  --index-name by-network-status \
  --key-condition-expression "network = :n" \
  --expression-attribute-values '{":n":{"S":"mainnet"}}' \
  --region us-east-1
```

Debería devolver la fila que acabamos de insertar.

## Criterio de done

- 2 KMS keys nuevas visibles en AWS Console
- IAM policies actualizadas, Lambdas pueden firmar con ambas keys (verificar con test invoke)
- 200 XLM en RelayerFundMainnetKey address, 50 XLM en ChannelsFundMainnetKey address
- Row de `v3.1.0 mainnet` insertada en `contract-versions` con GSI queryable
- Env vars nuevos visibles en las Lambdas (verificar en CloudWatch Log Events con `console.log(process.env)`)

## Riesgos

- **Key mismatch entre Stellar CLI y KMS**: el usuario puede confundirse pensando que necesita dos accounts. Aclarar: la KMS es la canónica para firma runtime, la Stellar CLI es solo para deploy manual (una sola vez).
- **Costo mensual KMS**: cada asymmetric key cuesta 1 USD por mes. Dos keys nuevas = 2 USD por mes adicional.

## Notas

Ninguna todavía.
