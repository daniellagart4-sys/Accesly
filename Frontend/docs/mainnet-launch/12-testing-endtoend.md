# Fase 12: Testing End to End

Batería completa de tests antes de abrir beta. Smoke test manual, load test, rollback test, cross network test.

Duración estimada: 3 días.

## Prerequisitos

- Fases 2 al 11 completadas.
- Contract mainnet deployado y activo.
- Al menos 100 XLM en el relayer mainnet.
- 1 CLABE test que responda para offramp (podés usar tu propia CLABE personal).

## Smoke test manual mainnet (2 a 3 horas)

Ejecutar en persona el flow completo del user típico.

### Setup

- [ ] Crear app "smoke-test-mainnet" en el dashboard con network=mainnet
- [ ] Copiar el appId

### Signup flow

- [ ] Abrir `/demo` en un browser fresh (private mode ideal)
- [ ] Verificar que el appConfig loading badge muestre "MAINNET"
- [ ] Signup con email nuevo (que no exista en Cognito). Confirmar código de verification.
- [ ] Signup exitoso, redirigido a create-wallet

### Wallet creation

- [ ] Ingresar passphrase de recovery (elegir una y ANOTARLA)
- [ ] Ver warning modal "MAINNET fondos reales" con checkbox
- [ ] Aprobar el biométrico cuando aparezca
- [ ] Esperar deploy on chain (target 10 a 30 seg)
- [ ] Verificar wallet address on-chain: abrir `https://stellar.expert/explorer/public/contract/<address>` y ver el contract deployado
- [ ] En el kit `<WalletHome />` debe mostrar balance 0 XLM y badge "MAINNET"

### KYC + on ramp

- [ ] En `/wallet`, click "Cargar fondos" o similar
- [ ] `<AddFundsFlow />` muestra formulario KYC (por ser primer vez)
- [ ] Ingresar datos válidos: nombre real, CURP real, CLABE tuya real, phone, birthdate
- [ ] Submit KYC
- [ ] Redirige a authorizationUrl de Dynerox (auth.dynerox.com/{route_id})
- [ ] Completar liveness check en Dynerox (selfie + video)
- [ ] Volver al app
- [ ] Poll de useKyc detecta status = 'active' en 30-60 seg
- [ ] Ingresar monto 100 MXN
- [ ] Route generada, backend devuelve authorizationUrl con instrucciones SPEI
- [ ] Hacer SPEI real de 100 MXN (o esperar sandbox si estás en test)
- [ ] En 1-10 minutos, USDC llega al Stellar wallet mainnet
- [ ] Balance en el kit se actualiza vía SSE o poll

### Swap

- [ ] En `/swap`, seleccionar XLM → USDC con monto de prueba (~5 USDC)
- [ ] Ver quote, price impact, plataforma
- [ ] Ver warning modal mainnet (por ser mainnet)
- [ ] Aprobar biométrico
- [ ] Tx submitea. Verificar en stellar.expert que la tx se ejecutó
- [ ] Balance updateado en kit

### Send

- [ ] En `/send`, ingresar otra address Stellar mainnet (crear un segundo user o usar una address propia externa)
- [ ] Monto de prueba (~2 XLM)
- [ ] Aprobar biométrico
- [ ] Tx submitea. Verificar destino recibió los XLM

### Off ramp

- [ ] En Off ramp, ingresar monto en USDC (~20)
- [ ] Seleccionar la CLABE registrada
- [ ] Aprobar
- [ ] Backend arma tx Stellar (USDC → hot wallet Dynerox), submitea
- [ ] Dynerox procesa SPEI outbound, MXN llega a la CLABE del user en < 30 min

### Recovery

- [ ] Borrar IndexedDB del browser (DevTools > Application > IndexedDB > Delete)
- [ ] Volver a `/demo`
- [ ] Login otra vez con el mismo email
- [ ] Verificar que muestra "Ya tenés wallet" con CTA "Ir a recovery"
- [ ] Ejecutar `<RecoveryFlow />` con OTP de email + passphrase
- [ ] Aprobar biométrico nuevo
- [ ] Rotate signer on chain
- [ ] Verificar en stellar.expert que la tx rotate_signer se ejecutó
- [ ] Wallet operativa de nuevo, con un nuevo passkey
- [ ] Hacer un swap post recovery para confirmar que el nuevo passkey firma correctamente

## Rollback test

Verificar que el kill switch de Fase 8 funciona:

- [ ] En dashboard `/admin/flags`, toggle `mainnet_enabled_global` a OFF
- [ ] Esperar 30 seg (cache TTL)
- [ ] En el smoke test app mainnet, intentar swap
- [ ] Debe devolver 503 con mensaje descriptivo
- [ ] En un app testnet paralelo, intentar swap
- [ ] Debe funcionar normal (no afectado)
- [ ] Toggle back a ON
- [ ] Retry swap mainnet, debe funcionar

## Load test

En testnet (no en mainnet para no gastar XLM real):

Script `scripts/load-test.mjs`:

```javascript
import { runK6 } from './k6-wrapper.mjs';

await runK6({
  scenarios: {
    signup_flood: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 100 },
      ],
    },
  },
  script: 'signup-flow.js',
});
```

Signup flow simula 100 concurrent users creando wallet en testnet:

- [ ] Signup Cognito
- [ ] Confirm email (usar mailhog o similar)
- [ ] Bootstrap wallet
- [ ] Verificar en balance

Métricas objetivo:

- [ ] p99 latency Lambda create-wallet < 30 seg
- [ ] Error rate < 1%
- [ ] DDB throttling: 0
- [ ] KMS quota: sin near limit

Si supera thresholds, tuning:

- Reserved concurrency en Lambdas críticas
- DDB on demand vs provisioned
- KMS quota increase request

## Cross network test

Verificar que un bug de código no cruza wallets entre networks:

- [ ] Crear app "cross-test-tn" testnet + app "cross-test-mn" mainnet
- [ ] Signup user A en el app testnet, crear wallet
- [ ] Signup user B en el app mainnet, crear wallet (mismo email si querés edge case)
- [ ] Verificar en stellar.expert:
  - Wallet de A existe en testnet, NO existe en mainnet
  - Wallet de B existe en mainnet, NO existe en testnet
- [ ] Verificar en DDB `user_fragments`:
  - Row de A tiene `network=testnet`
  - Row de B tiene `network=mainnet`
- [ ] Verificar en audit_logs que los events tienen `network` correcto

## Recovery multi user test

Edge case: user con dual Cognito accounts (Fase 4 y recovery cognitoSub binding):

- [ ] User C hace signup en app-A con email + password → Cognito user A1 con email X
- [ ] User C hace login en app-B con Google → Cognito user A2 con email X (diferente sub!)
- [ ] User C recupera desde app-B usando Google recovery flow
- [ ] Verificar que solo la wallet de A2 (Google user) fue afectada, NO la de A1
- [ ] Wallet de A1 sigue funcionable con su passkey original

## Idempotency test

- [ ] POST /wallets con el mismo body y el mismo `Idempotency-Key`
- [ ] Segunda request devuelve exactly la misma response (no crea duplicate)
- [ ] Test con recovery/finalize idem

## KMS failure simulation

Simular KMS caído (no lo tirés real, mocké):

- [ ] Deshabilitar la KMS key mainnet manualmente
- [ ] Intentar submit tx
- [ ] Verificar que devuelve 500 con mensaje útil (no crashea Lambda)
- [ ] Re habilitar la key
- [ ] Retry, funciona

## Documento de resultados

Al terminar el testing, escribir `docs/testing/2026-07-XX-mainnet-smoke-test.md` con:

- Fechas de cada test
- Resultado (pass / fail)
- Bugs encontrados y sus fixes
- Métricas de performance
- Decisión: go / no-go para Fase 13

## Criterio de done

- Smoke test manual mainnet: TODOS los pasos pass
- Rollback test: kill switch funciona en < 30 seg
- Load test testnet: p99 < 30 seg, error rate < 1%
- Cross network test: no cross contamination detectada
- Recovery multi user test: pass
- Idempotency test: pass
- KMS failure sim: pass (degrada gracefully)
- Documento de testing escrito y compartido

## Riesgos

- **Bugs no cubiertos**: testing manual siempre tiene blind spots. Complementar con feedback loop rápido en Fase 13 (beta cerrada).
- **Load test en testnet vs mainnet**: en mainnet el gas cuesta real, no querés simular 100 signups falsos. Los resultados de testnet son proxy razonable.

## Notas

Ninguna todavía.
