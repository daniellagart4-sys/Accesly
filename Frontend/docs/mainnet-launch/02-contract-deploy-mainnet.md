# Fase 2: Contract Deploy Mainnet

Deploy de los 6 contratos Soroban activos al Stellar mainnet. Zk email verifier queda excluido porque ya no se usa. Los contratos Blend (blend-vault, blend-yield-policy, blend-rule, yield-distribution) también quedan afuera porque son deprecated.

Duración estimada: 6 a 8 horas de trabajo activo, más 1 a 2 días de propagación y verificación.

## Prerequisitos

- Stellar CLI instalado localmente (`cargo install --locked stellar-cli`)
- Cuenta en Kraken o Binance con capacidad de comprar y transferir XLM
- Repo `accesly-contracts` local con acceso a `scripts/deploy_testnet.sh` como referencia
- Repo `CloudServices-accesly` local para actualizar `stellar.ts` post deploy

## Paso 1: Generar 3 keypairs mainnet localmente

Los 3 secrets nunca deben salir de la máquina del developer que los genera. Ideal en macOS Keychain, Windows Credential Manager, o mejor todavía en Ledger hardware wallet.

```bash
# Generar 3 keypairs con secure store
stellar keys generate --global accesly-deployer-mainnet --secure-store
stellar keys generate --global accesly-relayer-mainnet --secure-store
stellar keys generate --global accesly-channels-mainnet --secure-store

# Obtener las public addresses (safe compartir)
stellar keys address accesly-deployer-mainnet
stellar keys address accesly-relayer-mainnet
stellar keys address accesly-channels-mainnet
```

Guardar las 3 public addresses en un archivo temporal para configurarlas en CDK después.

## Paso 2: Comprar y transferir XLM

En Kraken o Binance:

1. Comprar 265 XLM (aproximadamente 30 a 35 USD al precio del día)
2. Transferir a las 3 addresses según la tabla:

| Address | XLM | Uso |
|---------|-----|-----|
| accesly-deployer-mainnet | 15 XLM | Deploy 6 contracts + WASM upload + reserves |
| accesly-relayer-mainnet | 200 XLM | Fees de todas las user txs + reserves de SA per user |
| accesly-channels-mainnet | 50 XLM | Fee bumps SDEX |

Dejar el memo vacío. Verificar cada tx en `https://stellar.expert/explorer/public/account/{ADDRESS}` con finalidad de 2 a 5 segundos.

## Paso 3: Preparar deploy script

Crear `accesly-contracts/scripts/deploy_mainnet.sh` como copia de `deploy_testnet.sh` con los siguientes ajustes:

- [ ] `NETWORK="mainnet"`
- [ ] `ACCOUNT="accesly-deployer-mainnet"`
- [ ] Skip Friendbot (no existe en mainnet)
- [ ] Skip zk-email-verifier deploy
- [ ] Skip CETES + Blend (deprecated)
- [ ] USDC SAC mainnet: `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75`
- [ ] USDC issuer mainnet: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
- [ ] Output a `scripts/deployed_addresses_mainnet.env`

Contratos a deployar (6):

1. ed25519-verifier
2. secp256r1-verifier
3. spending-limit
4. session-key
5. upgrade-rule
6. governance

Plus upload del WASM `smart-account` (no se deploya, es referencia para el factory).

## Paso 4: Ejecutar deploy

```bash
cd accesly-contracts
./scripts/deploy_mainnet.sh
```

Verificar en Stellar Expert cada contract address deployado:
- `https://stellar.expert/explorer/public/contract/{contractId}`

## Paso 5: Actualizar CDK env context

Agregar las 3 public addresses en el env context de CDK. Editar `accesly:env:dev` en `cdk.json`:

```json
{
  "accesly:env:dev": {
    "relayerFundAddress": "<KEEP existing testnet>",
    "relayerFundAddressMainnet": "<pubkey de accesly-relayer-mainnet>",
    "channelsFundAddressMainnet": "<pubkey de accesly-channels-mainnet>",
    "deployerMainnetAddress": "<pubkey de accesly-deployer-mainnet>"
  }
}
```

## Paso 6: Registrar contract addresses en CloudServices

Actualizar `CloudServices-accesly/lambdas/shared/src/stellar.ts`:

- [ ] Remover cualquier referencia a `zk-email-verifier` (line 30-85, buscar y limpiar)
- [ ] Agregar bloque `CONTRACTS_MAINNET`:

```typescript
const CONTRACTS_MAINNET = {
  usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  usdcSac: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  ed25519Verifier: '<mainnet address post-deploy>',
  secp256r1Verifier: '<mainnet address post-deploy>',
  spendingLimit: '<...>',
  sessionKey: '<...>',
  upgradeRule: '<...>',
  governance: '<...>',
  smartAccountWasmHash: '<mainnet wasm hash>',
};
```

- [ ] Refactorizar `getStellarConfig(network)` para retornar el right set según network.

## Paso 7: Smoke test manual

Deployar 1 Smart Account de prueba con el deployer mainnet:

```bash
stellar contract deploy \
  --wasm-hash <mainnet-wasm-hash> \
  --source accesly-deployer-mainnet \
  --network mainnet
```

Verificar que responde a `get_context_rules_count`:

```bash
stellar contract invoke \
  --id <deployed-contract-id> \
  --source accesly-deployer-mainnet \
  --network mainnet \
  -- get_context_rules_count
```

## Paso 8: Documentar en accesly.xyz/docs/networks

Ya está preparada la página con placeholders. Actualizar el WASM hash y addresses de mainnet una vez confirmados.

## Criterio de done

- 6 contratos deployados y verificables en stellar.expert mainnet
- 3 keypairs mainnet fondeadas correctamente (verificar en explorer)
- `deployed_addresses_mainnet.env` guardado en el repo `accesly-contracts`
- `stellar.ts` en CloudServices actualizado con `CONTRACTS_MAINNET`
- Smoke test manual: 1 Smart Account deployado y responde a queries básicas

## Riesgos

- **Timelock roles en mainnet**: al igual que en testnet, los roles del `governance` contract quedan concentrados en el deployer inicialmente. Blocking real para producción a escala. Rotar a multisig 2-of-2 con vos + un segundo dev antes de anunciar públicamente.
- **Gas price fluctuation**: si Stellar gas sube 10x, los 265 XLM alcanzan menos. Monitorear post launch y refondear si el relayer baja de 30 XLM.

## Notas

Ninguna todavía. Actualizar durante ejecución.
