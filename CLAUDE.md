# Accesly — Instrucciones para Claude

## Arquitectura del proyecto

- **Autenticación**: AWS Cognito (Google + Apple OAuth, JWT RS256)
- **Base de datos**: DynamoDB en AWS
- **Backend**: Lambdas en AWS + API Gateway
- **Relayer**: Node.js en EC2 (feature/relayer)
- **SDK**: `@accesly/sdk` npm package (React, client-side signing)
- **Signing**: Client-side en el device (WebAuthn/passkeys), el servidor NUNCA toca las keys
- **Recovery**: zkEmail (ZK proof on-chain)
- **Blockchain**: Stellar + Soroban smart contracts

## Tablas DynamoDB existentes (Fase 2, otro dev)
- `app_configs` — config por appId (fees, límites x402, CORS, redirect_uris)
- `user_fragments` — F2 cifrado con KMS
- `email_fragments` — F3 cifrado con PBKDF2
- `user_kyc_status` — estado KYC por userId
- `yield_positions` — posiciones de yield por userId+appId

## Tablas DynamoDB del Relayer (Fase 4, este dev)
- `relayer_transactions` — queue y estado de cada tx
- `usage_tracking` — conteo mensual x402 por appId
- `fund_account_swaps` — historial de reposición automática
- `channel_accounts` — pool de cuentas canal para procesamiento paralelo



## Git Workflow

Siempre seguir este flujo de ramas:

```
main
 └── dev
      └── feature/<nombre>   ← aquí se desarrolla
```

1. Toda feature nueva parte de `dev`, no de `main`
2. Nombre de rama: `feature/<descripcion-corta>` (ej. `feature/relayer`, `feature/x402`)
3. Cuando la feature está lista: PR de `feature/...` → `dev`
4. Solo después de revisar y aprobar en `dev`: PR de `dev` → `main`

**Nunca trabajar directo en `main` ni en `dev`.**

## gstack

Usar `/browse` de gstack para todo web browsing. Nunca usar `mcp__claude-in-chrome__*`.

Skills disponibles: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`
