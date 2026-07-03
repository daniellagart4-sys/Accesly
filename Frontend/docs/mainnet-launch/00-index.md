# Mainnet Launch Tracker

Ejecución del launch mainnet, dividido en 12 fases self contained. Cada archivo puede ejecutarse independientemente cuando tengas los prerequisitos listos. La documentación técnica pública (Fase 1) ya está publicada en `accesly.xyz/docs`.

## Estrategia

Multi network en la misma infra AWS. Cada app en el dashboard elige testnet o mainnet al crearse. Los Lambdas leen el network del `appConfig` por request y rutean al RPC + passphrase + contract correcto. Costo incremental: 5 USD por mes de KMS keys nuevas + 30 USD one time de fondeo XLM mainnet.

Sin audit externo formal. La red de seguridad viene de: cap 100 USD por wallet los primeros 3 meses, feature flags para kill switch en menos de 30 segundos, beta cerrada invite only, y los 6 audits internos Almanax ya done.

## Fases

| Fase | Archivo | Descripción | Duración estimada |
|------|---------|-------------|-------------------|
| 0 | Ya hecho | Blockers off code: Dynerox key, XLM buy, SES check | 1 día |
| 1 | Ya hecho | Documentación técnica pública en `accesly.xyz/docs` | 4 días |
| 2 | 02-contract-deploy-mainnet.md | Deploy de 6 contratos Soroban a Stellar mainnet | 2 días |
| 3 | 03-kms-keys-setup.md | KMS keys mainnet + registro de contratos en DDB | 1 día |
| 4 | 04-lambdas-multinetwork-refactor.md | Refactor de 12 Lambdas para leer network del appConfig | 4 días |
| 5 | 05-dynerox-integration.md | Reemplazo de Etherfuse por Dynerox en KYC + fiat | 4 días |
| 6 | 06-sdk-adapters.md | SDK con multi network awareness, useKyc, tipos Dynerox | 4 días |
| 7 | 07-dashboard-updates.md | Dashboard con network toggle + KYC status + admin flags | 4 días |
| 8 | 08-feature-flags.md | Tabla feature_flags + admin UI + kill switches | 3 días |
| 9 | 09-monitoring-alerting.md | CloudWatch alarms per network + PagerDuty + runbooks | 2 días |
| 10 | 10-legal-policies.md | ToS, Privacy, warnings, KYC consent screens | 2 días |
| 11 | 11-dns-ses-final.md | DNS routing y follow up de SES production access | 1 día |
| 12 | 12-testing-endtoend.md | Smoke test manual + load test + rollback test | 3 días |
| 13 | 13-beta-launch.md | Beta cerrada invite only, whitelist, cap 100 USD | 2 días |

Total ejecución: 15-17 días full time.

## Estado actual (2026-07-02)

- Documentación técnica: publicada
- Dynerox: Stellar USDC confirmado por el proveedor
- SES DKIM: verificado en el dominio accesly.xyz
- SES production access: pending (caso 177889633800399 denegado, requiere reopen)
- XLM mainnet fondos: pending compra
- Contract audit: los 6 internos de Almanax done, sin audit externo formal para esta fase

## Reglas de ejecución

1. Fases 2 y 3 se pueden hacer en paralelo con Fases 4-6 porque no tocan el mismo código.
2. Fase 7 (dashboard) depende de Fase 6 (SDK types).
3. Fases 8, 9, 10, 11 son independientes y se pueden hacer en paralelo con las demás.
4. Fase 12 requiere Fases 2 al 11 completadas.
5. Fase 13 arranca cuando Fase 12 pasa clean.

## Convenciones

- Cada archivo tiene checklist granular con paths file:line del código a tocar.
- Comandos AWS y CDK explícitos, listos para copy paste.
- Criterio de done al final de cada archivo. No cerrar una fase sin cumplir el criterio.
- Si una fase revela nuevos blockers, agregarlos como nota al final del archivo y notificar antes de continuar.

## Decisiones pendientes del usuario

1. Confirmar generación local de 3 keypairs mainnet (deployer, relayer, channels).
2. Compra de 265 XLM mainnet en Kraken o Binance.
3. Reopen del case AWS 177889633800399 para SES production access.
4. Cap financiero del beta cerrado (default 100 USD por wallet).
5. Hardware wallet Ledger para deployer key (opcional pero recomendado).
