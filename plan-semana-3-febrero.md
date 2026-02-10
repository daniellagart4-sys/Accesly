# Plan Semana 3 - Febrero 2026

## Accesly: Roadmap Tecnico

Tres pilares: (1) migrar key management a AWS KMS, (2) crear SDK embebible estilo Privy/Reown, (3) exponer API publica para desarrolladores.

---

## 1. Migracion SEP-30 a AWS KMS (Shamir's Secret Sharing)

### 1.1 Arquitectura actual vs propuesta

**Actual:** La secret key del usuario se encripta con AES-256-GCM y se guarda entera en Supabase.

**Propuesta:** Dividir la key en 3 shares con Shamir (2-of-3), distribuirlos en diferentes proveedores.

```
Secret Key (S...)
      |
      v
  split(key, 3, 2)   <-- 2-of-3 Shamir
      |
      +---> Share 1 --> AWS KMS Encrypt --> Supabase (columna kms_share)
      |
      +---> Share 2 --> AES-256-GCM (crypto.ts existente) --> Supabase (columna local_share)
      |
      +---> Share 3 --> Google Cloud KMS Encrypt --> Supabase proyecto separado (backup recovery)
```

**Para reconstruir (operacion normal):** Solo se necesitan 2 shares (1 + 2). Share 3 es backup.

### 1.2 Servicios AWS necesarios

| Servicio | Proposito | Costo mensual |
|----------|-----------|---------------|
| AWS KMS (1 CMK simetrico) | Encrypt/Decrypt Share 1 | ~$1.00 |
| IAM User | Credenciales para la app | Gratis |
| CloudTrail | Audit log automatico de operaciones KMS | Gratis (eventos de gestion) |

**Total AWS:** ~$1/mes para <1,000 usuarios.

No se necesita Lambda, Secrets Manager, ni EC2. KMS se invoca directo desde el backend SSR.

### 1.3 Paquetes npm

```bash
npm install shamir-secret-sharing @aws-sdk/client-kms
```

- `shamir-secret-sharing` - Libreria de Privy, auditada por Cure53 y Zellic, zero deps
- `@aws-sdk/client-kms` - SDK modular de AWS (solo KMS, no todo el SDK)

### 1.4 Consideraciones de seguridad

- La key existe en plaintext en memoria del servidor durante split/reconstruct. Hacer `.fill(0)` inmediato.
- `combine()` no verifica integridad: guardar SHA-256 hash del key original para validar reconstruccion.
- AWS CloudTrail registra cada Encrypt/Decrypt automaticamente (audit trail).
- En 2-of-3, comprometer 2 ubicaciones = compromiso total. Pero es mas resiliente a perdida.

### 1.6 Share 3 (backup recovery)

**Opcion recomendada para produccion:** Google Cloud KMS (~$1/mes extra). True multi-cloud.

**Opcion simple para empezar:** Segundo proyecto Supabase con credenciales independientes (gratis pero mismo proveedor).

**Opcion futura:** Entregar Share 3 al usuario como archivo encriptado descargable (soberania).

### 1.7 Flujos SEP-30 con Shamir (detallado)

El estandar SEP-30 define dos operaciones criticas que interactuan directamente con la secret key:
`signTransaction` (firma normal) y `recoverAccount` (recuperacion/rotacion). Ambas deben
adaptarse al esquema Shamir.

#### 1.7.1 Flujo: signTransaction (firma de transaccion)

Cuando un usuario o el SDK pide firmar una transaccion (POST `/api/sep30/sign/:address`).

```
1. Usuario envia tx XDR + prueba de identidad (JWT Supabase)
      |
      v
2. Verificar identidad (Google OAuth via Supabase Auth)
      |
      v
3. Obtener shares de Supabase
      |  - kms_share (encrypted by AWS KMS)
      |  - local_share (encrypted by AES-256-GCM)
      |
      v
4. Descifrar Share 1: AWS KMS Decrypt(kms_share) --> share1 plaintext
   Descifrar Share 2: AES-256-GCM decrypt(local_share) --> share2 plaintext
      |
      v
5. Reconstruir: combine([share1, share2]) --> secret key plaintext
      |
      v
6. Verificar integridad: SHA-256(secret_key) === key_hash almacenado
      |  Si no coincide --> ERROR, shares corruptos, intentar con Share 3
      |
      v
7. Firmar la transaccion con Keypair.fromSecret(secret_key)
      |
      v
8. LIMPIAR MEMORIA:
   - secret_key.fill(0)
   - share1.fill(0)
   - share2.fill(0)
      |
      v
9. Retornar tx firmada (XDR)
```

**Fallback con Share 3:** Si la verificacion de integridad falla (paso 6), intentar
reconstruir con combinaciones alternativas: (share1 + share3) o (share2 + share3).
Si ninguna funciona, los shares estan comprometidos y se debe notificar al usuario.

#### 1.7.2 Flujo: recoverAccount (recuperacion de cuenta)

Cuando un usuario pierde acceso y necesita rotar su keypair via SEP-30.
Este es el flujo mas critico porque involucra: reconstruir key vieja + generar key nueva +
actualizar on-chain + re-split + almacenar.

```
1. Usuario prueba identidad (Google OAuth re-auth)
      |
      v
2. Verificar identidad contra recovery_identities en DB
   (auth_method_type = 'google', auth_method_value = email)
      |
      v
3. RECONSTRUIR KEY VIEJA (mismo proceso que signTransaction pasos 3-6)
      |
      v
4. GENERAR KEY NUEVA:
   - newKeypair = Keypair.random()
   - newSecret = newKeypair.secret()
   - newPublicKey = newKeypair.rawPublicKey()
      |
      v
5. PRE-SPLIT KEY NUEVA (ANTES de tocar el contrato):
   - [newShare1, newShare2, newShare3] = split(newSecret, 3, 2)
   - newKeyHash = SHA-256(newSecret)
   - Cifrar newShare1 con AWS KMS
   - Cifrar newShare2 con AES-256-GCM
   - Cifrar newShare3 con proveedor de Share 3
      |
      v
6. GUARDAR SHARES NUEVOS EN DB (estado = 'pending'):
   - INSERT en tabla recovery_signers_pending (shares nuevos, flag pending)
   - NO borrar shares viejos todavia
      |
      v
7. ACTUALIZAR ON-CHAIN:
   - Reconstruir key vieja (ya la tenemos del paso 3)
   - Firmar update_owner(newPublicKey) con key vieja
   - Enviar tx al contrato Soroban
   - Esperar confirmacion
      |
      v
8. Si update_owner EXITOSO:
      |
      +---> Activar shares nuevos: UPDATE recovery_signers SET shares = new_shares
      +---> Actualizar wallets: public_key, stellar_address
      +---> Borrar shares viejos y registro pending
      +---> Fondear nueva address con Friendbot (testnet)
      |
      v
9. Si update_owner FALLA:
      |
      +---> Borrar shares pending (rollback)
      +---> Shares viejos siguen validos
      +---> Retornar error al usuario
      |
      v
10. LIMPIAR MEMORIA:
    - oldSecret.fill(0), newSecret.fill(0)
    - todos los shares plaintext.fill(0)
```

**Punto critico - Orden de operaciones:**
El orden es: split primero → guardar shares nuevos como pending → update on-chain → activar shares.
Esto garantiza que:
- Si falla el split/guardado: no se toca el contrato, key vieja sigue valida
- Si falla update_owner: se borran shares pending, key vieja sigue valida
- Si falla la activacion despues de update_owner: los shares pending existen y se pueden reintentar

#### 1.7.3 Flujo: signTransaction con contrato Soroban (__check_auth)

El contrato de Accesly usa `__check_auth` para account abstraction. Cuando el wallet
ejecuta operaciones on-chain (no pagos clasicos, sino invocaciones de contrato),
la firma pasa por el contrato.

```
1. Construir la invocacion del contrato (ej: invokeHostFunction)
      |
      v
2. El contrato espera: signature = sign(fn_name || args || nonce)
      |
      v
3. Reconstruir key del usuario (Shamir 2-of-3)
      |
      v
4. Obtener nonce actual: get_nonce(contractId)
      |
      v
5. Construir mensaje: concat(function_name, args_bytes, nonce_be_bytes)
      |
      v
6. Firmar mensaje con key reconstruida
      |
      v
7. Incluir firma como auth entry en la transaccion
      |
      v
8. Server keypair firma la tx (paga fees)
      |
      v
9. Submit a Soroban RPC
      |
      v
10. Limpiar memoria
```

#### 1.7.4 Tabla de estados para atomicidad (recovery)

Para manejar la atomicidad del flujo de recovery, agregar un campo `status` a los shares:

```sql
ALTER TABLE recovery_signers ADD COLUMN status TEXT DEFAULT 'active';
-- Valores: 'active', 'pending_rotation', 'rotated'

-- Indice para queries rapidas
CREATE INDEX idx_recovery_signers_status ON recovery_signers(wallet_id, status);
```

| Estado | Significado |
|--------|-------------|
| `active` | Shares actualmente en uso |
| `pending_rotation` | Shares nuevos guardados, esperando confirmacion on-chain |
| `rotated` | Shares viejos despues de rotacion exitosa (se pueden borrar o archivar para audit) |

#### 1.7.5 Manejo de fallos parciales

| Escenario | Estado | Accion |
|-----------|--------|--------|
| Split nuevo falla | Solo existen shares viejos (active) | Reintentar o notificar error |
| Guardar shares pending falla | Solo existen shares viejos (active) | Reintentar |
| `update_owner` on-chain falla | Shares viejos (active) + shares nuevos (pending) | Borrar pending, reintentar |
| `update_owner` exitoso, activacion falla | Shares viejos (active) + shares nuevos (pending) + contrato ya rotado | **Critico**: reintentar activacion, los shares pending son los unicos validos |
| AWS KMS no disponible | No se puede descifrar Share 1 | Usar Share 2 + Share 3 (fallback 2-of-3) |
| Supabase no disponible | No se pueden leer shares | Error total, esperar a que vuelva |

**Para el caso critico** (update_owner exitoso pero activacion falla): Agregar un cron job o
health check que busque shares con status `pending_rotation` por mas de 5 minutos y
los active automaticamente (verificando on-chain que el owner ya cambio).

### 1.8 Tareas de implementacion actualizadas

| # | Tarea | Estimacion |
|---|-------|------------|
| 1.8.1 | Crear cuenta AWS + IAM user con permisos `kms:Encrypt` + `kms:Decrypt` | Config |
| 1.8.2 | Crear CMK simetrico en us-east-1 | Config |
| 1.8.3 | Agregar env vars: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_KMS_KEY_ARN`, `AWS_REGION` | Config |
| 1.8.4 | Crear `services/kms.ts` - wrapper para AWS KMS encrypt/decrypt | Dev |
| 1.8.5 | Crear `services/shamir.ts` - split/combine con verificacion SHA-256 + fallback Share 3 | Dev |
| 1.8.6 | Migracion DB: columnas `kms_share`, `local_share`, `key_hash`, `status` en `recovery_signers` | DB |
| 1.8.7 | Actualizar `POST /api/wallet/create` - split en creacion | Dev |
| 1.8.8 | Actualizar `POST /api/wallet/send` - reconstruct para firmar pagos | Dev |
| 1.8.9 | Actualizar `sep30.ts signTransaction` - reconstruct + firma + limpieza memoria | Dev |
| 1.8.10 | Actualizar `sep30.ts recoverAccount` - flujo atomico completo (seccion 1.7.2) | Dev |
| 1.8.11 | Implementar fallback Share 3 cuando Share 1 o 2 falla | Dev |
| 1.8.12 | Health check: detectar shares `pending_rotation` huerfanos y resolver | Dev |
| 1.8.13 | Script de migracion: re-split keys existentes al esquema Shamir | Dev |
| 1.8.14 | Tests: split/combine roundtrip, recovery atomico, fallback Share 3, fallo parcial | Dev |

---

## 2. Frontend SDK - Estilo Privy/Reown

### 2.1 Que es

Un paquete npm (`@accesly/react`) que cualquier desarrollador instala en su app React/Next.js y con 5-10 lineas de codigo le da a sus usuarios wallets Stellar con login social.

### 2.2 Referencia: como lo hacen Privy y Reown

**Privy (modelo mas similar a Accesly):**
```tsx
// El desarrollador solo escribe esto:
<PrivyProvider appId="xxx" config={{...}}>
  <App />
</PrivyProvider>

// Y en cualquier componente:
const { login } = useLogin();
<button onClick={login}>Log in</button>
// Privy abre un modal pre-construido con Google, email, etc.
```

**Reown (para referencia de UI):**
```tsx
<AppKitButton />  // Un solo componente = boton + modal + todo
```

### 2.3 DX objetivo de Accesly SDK

```tsx
// 1. Instalar
// npm install @accesly/react

// 2. Wrap con provider (5 lineas)
import { AcceslyProvider } from '@accesly/react';

<AcceslyProvider
  apiKey="ak_live_xxxx"           // API key del developer dashboard
  network="testnet"                // testnet | mainnet
  theme="dark"                     // dark | light | auto
>
  <App />
</AcceslyProvider>

// 3. Usar en cualquier componente
import { useAccesly } from '@accesly/react';

function MyComponent() {
  const { login, logout, user, wallet } = useAccesly();

  return (
    <div>
      {user ? (
        <>
          <p>Balance: {wallet.balance} XLM</p>
          <button onClick={() => wallet.send('GDEST...', '10')}>Send</button>
          <button onClick={logout}>Logout</button>
        </>
      ) : (
        <button onClick={login}>Login with Google</button>
        // Abre modal de Accesly (hosted en iframe)
      )}
    </div>
  );
}

// 4. O usar el boton pre-construido (1 linea)
import { AcceslyButton } from '@accesly/react';

<AcceslyButton />  // Login + balance + send + receive, todo integrado
```

### 2.4 Arquitectura del SDK

```
Developer App (React)
    |
    v
@accesly/react (npm package)
    |
    +---> <AcceslyProvider> - Context provider, maneja estado auth/wallet
    +---> <AcceslyButton>   - Componente pre-construido (boton + modal)
    +---> <AcceslyModal>    - Modal standalone para login/wallet
    +---> useAccesly()      - Hook principal: login, logout, user, wallet
    +---> useWallet()       - Hook wallet: balance, send, receive, history
    +---> useBalance()      - Hook solo balance (auto-refresh)
    |
    v
Accesly API (hosted por nosotros)
    |
    +---> POST /v1/auth/login       - Google OAuth (Supabase Auth)
    +---> GET  /v1/wallet/balance   - Balance XLM
    +---> POST /v1/wallet/send      - Enviar pago
    +---> GET  /v1/wallet/history   - Historial
    +---> GET  /v1/wallet/address   - Direccion Stellar
    |
    v
Accesly Backend (nuestro Supabase + AWS KMS + Stellar)
```

### 2.5 Componentes del paquete npm

| Componente/Hook | Tipo | Descripcion |
|-----------------|------|-------------|
| `<AcceslyProvider>` | Provider | Configura API key, network, theme. Requerido. |
| `<AcceslyButton>` | Componente | Boton all-in-one: login si no autenticado, wallet info si autenticado |
| `<AcceslyModal>` | Componente | Modal con login + wallet UI completo |
| `useAccesly()` | Hook | `{ login, logout, user, wallet, isReady, isAuthenticated }` |
| `useWallet()` | Hook | `{ balance, send, address, history, refreshBalance }` |
| `useBalance()` | Hook | `{ balance, loading }` con auto-refresh |
| `useSendTransaction()` | Hook | `{ send, sending, txHash, error }` |

### 2.6 Modal UI (iframe vs inline)

**Opcion A - iframe (recomendada para seguridad):**
- El modal corre en un iframe apuntando a `https://sdk.accesly.io/modal`
- Comunicacion via `postMessage`
- El token de auth nunca toca el JS del developer
- Privy usa este modelo

**Opcion B - inline (mas simple):**
- El modal se renderiza directo en el DOM del developer
- Mas facil de customizar
- Menos aislamiento de seguridad

**Recomendacion:** Empezar con inline (mas rapido de construir), migrar a iframe cuando haya mas developers.

### 2.7 Tareas de implementacion

| # | Tarea | Estimacion |
|---|-------|------------|
| 2.7.1 | Crear monorepo: `packages/react-sdk`, `packages/core` | Setup |
| 2.7.2 | `packages/core` - Cliente HTTP para Accesly API, tipos TypeScript | Dev |
| 2.7.3 | `packages/react-sdk` - AcceslyProvider con Context API | Dev |
| 2.7.4 | Hooks: `useAccesly`, `useWallet`, `useBalance`, `useSendTransaction` | Dev |
| 2.7.5 | `<AcceslyButton>` - Componente con estados login/wallet | Dev |
| 2.7.6 | `<AcceslyModal>` - Modal completo (login form + wallet dashboard) | Dev |
| 2.7.7 | Theming: CSS variables, dark/light, customizable por el developer | Dev |
| 2.7.8 | Build con tsup/rollup, publicar como ESM + CJS | Setup |
| 2.7.9 | README + docs + ejemplo Next.js | Docs |
| 2.7.10 | Publicar en npm como `@accesly/react` | Release |

---

## 3. API Publica + Developer Dashboard

### 3.1 Que es

Una REST API publica (`api.accesly.io`) que developers consumen con API keys. El SDK de React la usa internamente, pero tambien se puede usar directamente sin SDK (para backends, mobile, etc.).

### 3.2 Sistema de API Keys

```
Developer se registra en dashboard.accesly.io
    |
    v
Crea un "Proyecto" (app)
    |
    v
Recibe:
  - API Key publica:  ak_live_xxxx  (para frontend, rate limited)
  - API Secret:       sk_live_xxxx  (para backend, full access)
  - Project ID:       proj_xxxx
```

### 3.3 Endpoints de la API

**Auth:**
| Metodo | Endpoint | Descripcion | Auth |
|--------|----------|-------------|------|
| POST | `/v1/auth/google` | Inicia OAuth con Google, retorna session token | API Key |
| POST | `/v1/auth/callback` | Callback de OAuth, retorna JWT | API Key |
| POST | `/v1/auth/logout` | Cierra sesion | JWT |
| GET | `/v1/auth/user` | Info del usuario autenticado | JWT |

**Wallet:**
| Metodo | Endpoint | Descripcion | Auth |
|--------|----------|-------------|------|
| GET | `/v1/wallet` | Info de wallet (address, contract ID) | JWT |
| GET | `/v1/wallet/balance` | Balance XLM y otros assets | JWT |
| POST | `/v1/wallet/send` | Enviar XLM | JWT |
| GET | `/v1/wallet/history` | Historial de transacciones | JWT |
| GET | `/v1/wallet/address` | Solo la direccion Stellar | JWT |

**Admin (con API Secret):**
| Metodo | Endpoint | Descripcion | Auth |
|--------|----------|-------------|------|
| GET | `/v1/admin/users` | Listar usuarios del proyecto | Secret |
| GET | `/v1/admin/users/:id` | Info de un usuario | Secret |
| GET | `/v1/admin/stats` | Estadisticas (wallets creadas, txs, etc.) | Secret |

### 3.4 Infraestructura

```
api.accesly.io
    |
    v
Vercel (o Cloudflare Workers)
    |
    +---> Supabase Auth     (Google OAuth)
    +---> Supabase Postgres  (wallets, shares, api_keys, projects)
    +---> AWS KMS            (Share 1 encrypt/decrypt)
    +---> Stellar Horizon    (balance, send, history)
    +---> Soroban RPC        (contract deployment, init)
```

### 3.5 Tablas nuevas en DB

```sql
-- Developer projects (cada developer puede tener multiples apps)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,        -- ak_live_xxxx
  api_secret TEXT UNIQUE NOT NULL,     -- sk_live_xxxx (hashed)
  allowed_origins TEXT[],              -- CORS whitelist
  network TEXT DEFAULT 'testnet',      -- testnet | mainnet
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rate limiting / usage tracking
CREATE TABLE api_usage (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Vincular wallets a projects (multi-tenant)
ALTER TABLE wallets ADD COLUMN project_id UUID REFERENCES projects(id);
```

### 3.6 Tareas de implementacion

| # | Tarea | Estimacion |
|---|-------|------------|
| 3.6.1 | Disenar API REST v1 con OpenAPI spec | Design |
| 3.6.2 | Migracion DB: tablas `projects`, `api_usage`, agregar `project_id` a `wallets` | DB |
| 3.6.3 | Middleware de autenticacion: validar API Key + JWT + rate limit | Dev |
| 3.6.4 | Migrar endpoints existentes (`/api/wallet/*`) al formato `/v1/*` | Dev |
| 3.6.5 | Endpoints de admin (`/v1/admin/*`) | Dev |
| 3.6.6 | Developer dashboard: registro, crear proyectos, ver API keys, stats | Dev |
| 3.6.7 | Rate limiting (por API key, por IP) | Dev |
| 3.6.8 | CORS dinamico basado en `allowed_origins` del proyecto | Dev |
| 3.6.9 | Documentacion de la API (Swagger/Redoc) | Docs |
| 3.6.10 | Deploy API en dominio propio (`api.accesly.io`) | Infra |

---

## 4. Orden de ejecucion sugerido

```
Fase 1: AWS KMS (Seccion 1)
  Prerequisito para todo lo demas.
  La key management debe estar solida antes de exponer API publica.
  |
  v
Fase 2: API Publica (Seccion 3)
  Refactorizar endpoints actuales a formato API versionada.
  Agregar sistema de API keys y multi-tenancy.
  |
  v
Fase 3: Frontend SDK (Seccion 2)
  El SDK consume la API publica.
  No tiene sentido construir el SDK sin la API estable.
```

---

## 5. Resumen de costos mensuales

| Servicio | Costo |
|----------|-------|
| AWS KMS (1 CMK) | ~$1.00 |
| Google Cloud KMS (Share 3, opcional) | ~$1.00 |
| Supabase (plan actual) | Existente |
| Vercel (plan actual) | Existente |
| Dominio `accesly.io` (si se compra) | ~$3/mes |
| **Total incremental** | **~$2-5/mes** |

---

*Documento generado: Febrero 2026*
*Proyecto: Accesly - Stellar Account Abstraction Wallet*

---

## 6. Testing, Seguridad y Auditorias para Produccion

Todo lo que necesitas probar y auditar antes de lanzar el SDK publicamente.

### 6.1 Testing del Smart Contract (Soroban)

| Test | Que verificar |
|------|---------------|
| `init` con owner zero (32 bytes de ceros) | Debe rechazar |
| `init` llamado dos veces | Debe fallar en la segunda |
| `update_owner` con firma invalida | Debe rechazar |
| `update_owner` con nonce reutilizado (replay attack) | Debe rechazar, nonce ya incremento |
| `update_owner` con nonce futuro | Debe rechazar |
| `__check_auth` con firma de un owner anterior (post-rotacion) | Debe rechazar, el owner ya cambio |
| `__check_auth` con firma correcta pero tx modificada (tampering) | Debe rechazar |
| Dos contratos independientes no comparten estado | Nonce y owner aislados |
| Gas/resource limits en deploy + init + update_owner | Que no exceda limites de Soroban |

### 6.2 Testing de Shamir + KMS

| Test | Que verificar |
|------|---------------|
| split → combine roundtrip con los 3 pares posibles | (1+2), (1+3), (2+3) todos reconstruyen la key original |
| combine con 1 solo share | Debe fallar (threshold es 2) |
| combine con shares de diferentes keys mezclados | Debe dar resultado incorrecto, SHA-256 hash no coincide |
| combine con share corrupto (1 byte alterado) | SHA-256 hash no coincide, detecta corrupcion |
| AWS KMS encrypt → decrypt roundtrip | Share 1 se recupera identico |
| AES-256-GCM encrypt → decrypt roundtrip | Share 2 se recupera identico |
| KMS no disponible (timeout/error) | Fallback a Share 2 + Share 3 funciona |
| ENCRYPTION_KEY rotado | Keys existentes con key vieja siguen descifrables (o migration path) |
| Limpieza de memoria | Despues de combine, buffers de shares y key estan en ceros (.fill(0)) |
| 1000 splits concurrentes | Sin race conditions ni leaks de memoria |

### 6.3 Testing de SEP-10 (Web Authentication)

| Test | Que verificar |
|------|---------------|
| `createChallenge` con cuenta G... valida | Retorna XDR valido con ManageData ops, timeBounds correctos, sequence 0 |
| `createChallenge` con cuenta invalida (no G..., largo incorrecto) | Error controlado antes de construir tx |
| `verifyChallenge` con firma de server + client validas | Retorna JWT con `sub` = cuenta del cliente |
| `verifyChallenge` sin firma del server | Rechaza ("Missing server signature") |
| `verifyChallenge` sin firma del client | Rechaza ("Missing client signature") |
| `verifyChallenge` con challenge expirado (fuera de timeBounds) | Rechaza ("Challenge expired") |
| `verifyChallenge` con challenge que aun no es valido (minTime en el futuro) | Rechaza |
| `verifyChallenge` con XDR de FeeBumpTransaction | Rechaza ("Expected a Transaction") |
| `verifyChallenge` con XDR malformado (no base64 valido) | Error controlado, no crash |
| `verifyChallenge` con firma valida pero ManageData source alterado | La cuenta extraida no coincide con el firmante, rechaza |
| Replay: enviar el mismo challenge firmado dos veces | Definir comportamiento (el JWT se genera igual, pero el challenge deberia tener nonce unico) |
| JWT emitido tiene claims correctos | `iss` = HOME_DOMAIN, `sub` = cuenta, `exp` = now + 24h |
| `verifySep10Token` con JWT valido | Retorna la cuenta correcta |
| `verifySep10Token` con JWT expirado | Rechaza |
| `verifySep10Token` con JWT firmado con otro secret | Rechaza |
| `verifySep10Token` con JWT con `sub` alterado (tampering) | Rechaza (firma invalida) |
| Challenge con HOME_DOMAIN vacio o undefined | Error controlado al crear, no genera challenge roto |
| SEP10_SERVER_SECRET no configurado | Error claro al primer uso (lazy init), no crash al importar |

### 6.4 Testing de SEP-30 (Account Recovery)

| Test | Que verificar |
|------|---------------|
| `signTransaction` con identidad valida | Firma la tx correctamente |
| `signTransaction` con JWT expirado | Rechaza |
| `signTransaction` con JWT de otro usuario | Rechaza, no firma keys ajenas |
| `signTransaction` con tx XDR malformado | Error controlado, no crash |
| `recoverAccount` flujo completo | Key vieja → rotate on-chain → key nueva funciona |
| `recoverAccount` falla en update_owner | Rollback: shares viejos siguen activos, pending borrados |
| `recoverAccount` exitoso pero falla activacion | Shares pending existen, health check los resuelve |
| `recoverAccount` con email diferente al registrado | Rechaza (identidad no coincide) |
| Dos recovery simultaneos para el mismo wallet | Solo uno debe completarse, el otro falla (lock/mutex) |
| Recovery despues de recovery | La key rotada se puede rotar otra vez |

### 6.5 Testing de API

| Test | Que verificar |
|------|---------------|
| Todos los endpoints sin auth header | 401 Unauthorized |
| API key invalida | 401 |
| API key de un proyecto accediendo wallets de otro proyecto | 403, aislamiento multi-tenant |
| Rate limit excedido | 429 Too Many Requests |
| `POST /v1/wallet/send` con monto negativo | Rechaza |
| `POST /v1/wallet/send` con monto mayor al balance | Error descriptivo |
| `POST /v1/wallet/send` con direccion invalida (no G..., largo incorrecto) | Rechaza antes de tocar Stellar |
| `POST /v1/wallet/send` con destination = propia address | Definir comportamiento (permitir o rechazar) |
| `GET /v1/wallet/balance` con cuenta no fondeada | Retorna 0, no error |
| CORS: request desde origin no autorizado | Bloqueado |
| CORS: request desde origin en whitelist | Permitido |
| SQL injection en todos los parametros de entrada | No funciona (queries parametrizadas) |
| Request body > 1MB | Rechazado antes de procesar |
| 100 requests concurrentes al mismo endpoint | Sin degradacion, sin datos corruptos |

### 6.6 Testing del SDK (@accesly/react)

| Test | Que verificar |
|------|---------------|
| `<AcceslyProvider>` sin apiKey | Error claro en consola, no crash |
| `useAccesly()` fuera de Provider | Error descriptivo |
| `login()` abre modal/OAuth correctamente | Flujo completo hasta autenticado |
| `logout()` limpia estado y tokens del browser | No queda session data |
| `wallet.send()` con parametros invalidos | Error antes de llamar API |
| `useBalance()` auto-refresh | Se actualiza cada N segundos |
| SDK en Next.js (SSR) | No rompe por `window`/`document` en server |
| SDK en Vite + React | Funciona sin config extra |
| SDK en app con React 18 y React 19 | Compatible con ambos |
| Dos `<AcceslyProvider>` en la misma pagina | Error o comportamiento definido |
| Network tab: no se leakean tokens/keys en requests | Verificar headers y payloads |
| Bundle size del SDK | Debe ser < 50KB gzipped idealmente |

### 6.7 Pruebas de seguridad especificas

Estas son las pruebas que un atacante intentaria. Hay que verificar que todas fallan:

**Criptografia y keys:**

| Ataque | Como probarlo |
|--------|---------------|
| Extraer secret key de memoria del servidor | Memory dump del proceso Node.js despues de firmar. La key no debe estar en el heap. |
| Timing attack en comparacion de hashes | SHA-256 verify debe usar comparacion constant-time (`crypto.timingSafeEqual`) |
| Forzar reconstruct sin autenticacion | Todos los endpoints de firma requieren JWT valido |
| Acceder a AWS KMS con credenciales robadas de env | Las credenciales solo permiten encrypt/decrypt en 1 key, no listar ni crear |
| Descifrar share AES sin ENCRYPTION_KEY | Imposible sin la key de 256 bits |
| Reutilizar un share de otro usuario | Los shares son especificos por key, mezclar da garbage + hash verification falla |

**Autenticacion y sesiones:**

| Ataque | Como probarlo |
|--------|---------------|
| JWT forgery (firmar JWT falso) | Solo funciona con JWT_SECRET, verificar que se valida correctamente |
| Session fixation | Un token pre-generado no debe dar acceso |
| CSRF en endpoints POST | Verificar que se requiere Authorization header (no cookies) |
| Token replay despues de logout | Token invalidado no debe funcionar |
| Escalacion de privilegios: user A accede wallet de user B | JWT de A solo retorna datos de A, RLS de Supabase como segunda barrera |
| API key de testnet usada en mainnet | Debe rechazar, network mismatch |

**Infraestructura:**

| Ataque | Como probarlo |
|--------|---------------|
| SSRF: hacer que el servidor haga requests internos | Validar que destination address en send no es una URL/IP |
| Path traversal en parametros de ruta | `[address]` sanitizado a formato Stellar valido |
| DoS via requests costosos (deploy contract spam) | Rate limit + el deploy requiere server keypair con fondos limitados |
| Enumerate wallets via timing en 404 vs 403 | Respuestas deben tomar el mismo tiempo |
| Man-in-the-middle entre servidor y AWS KMS | TLS obligatorio, SDK de AWS lo fuerza |
| Supply chain: dependencia npm comprometida | Lockfile pinneado, verificar integridad |

### 6.8 Auditorias necesarias

En orden de prioridad para lanzamiento:

**Tier 1 - Obligatorias antes de mainnet:**

| Auditoria | Que cubre | Quien puede hacerla | Costo aproximado |
|-----------|-----------|---------------------|-------------------|
| **Smart Contract Audit** | Contrato Soroban: init, update_owner, __check_auth, manejo de nonce | OtterSec, Halborn, CertiK, Zellic | $5,000 - $20,000 |
| **Cryptographic Review** | Shamir implementation, KMS integration, AES-256-GCM usage, key lifecycle, memory handling | NCC Group, Trail of Bits, Cure53 | $10,000 - $30,000 |
| **Penetration Test (API + Backend)** | Todos los endpoints, autenticacion, autorizacion, OWASP Top 10, business logic | Cualquier firma de pentest reputada | $5,000 - $15,000 |

**Tier 2 - Recomendadas antes de escalar:**

| Auditoria | Que cubre | Costo aproximado |
|-----------|-----------|-------------------|
| **SDK Security Review** | Paquete npm: no leakea tokens, XSS, postMessage seguro (si iframe), CSP compatible | $3,000 - $10,000 |
| **Infrastructure Audit** | Config de Supabase RLS, IAM permissions, Vercel settings, env vars, CORS, headers | $3,000 - $8,000 |
| **Dependency Audit** | Review de todas las dependencias npm por vulnerabilidades conocidas y supply chain risk | $2,000 - $5,000 |

**Tier 3 - Para credibilidad enterprise:**

| Auditoria | Que cubre | Costo aproximado |
|-----------|-----------|-------------------|
| **SOC 2 Type II** | Controles de seguridad organizacionales, procesos, manejo de datos | $20,000 - $50,000+ |
| **Bug Bounty Program** | Incentivo continuo para que hackers reporten vulnerabilidades | $500 - $5,000 por bug (ongoing) |

### 6.9 Checklist pre-produccion

Cosas que deben estar verificadas el dia del lanzamiento:

**Configuracion:**
- [ ] ENCRYPTION_KEY es unico, generado con CSPRNG, nunca commiteado en git
- [ ] JWT_SECRET es diferente a ENCRYPTION_KEY
- [ ] AWS IAM user tiene SOLO kms:Encrypt + kms:Decrypt (nada mas)
- [ ] Supabase RLS activo en TODAS las tablas, verificado con queries directas
- [ ] CORS solo permite origines registrados por developers
- [ ] Rate limits configurados y testeados
- [ ] Todos los env vars de produccion son diferentes a los de testnet/dev
- [ ] Server keypair de produccion (STELLAR_SERVER_SECRET) es diferente al de testnet
- [ ] WASM hash de mainnet es diferente al de testnet (redeploy del contrato)

**Operacional:**
- [ ] Monitoring/alertas para: errores de KMS, fallos de reconstruccion, shares pending huerfanos
- [ ] Logging de todas las operaciones de firma (sin loguear keys ni shares)
- [ ] Backup strategy para Supabase (point-in-time recovery habilitado)
- [ ] Procedimiento documentado de incident response (key compromise, DB breach, AWS breach)
- [ ] Health check endpoint que verifica conectividad con KMS, Supabase, Horizon, Soroban RPC

**Legal:**
- [ ] Terms of Service para developers que usan el SDK
- [ ] Privacy Policy (manejas keys de usuarios, esto es critico)
- [ ] Data Processing Agreement (DPA) si operas en EU/para usuarios EU
- [ ] Disclosure claro de que es modelo custodial (tu tienes acceso a reconstruir keys)
