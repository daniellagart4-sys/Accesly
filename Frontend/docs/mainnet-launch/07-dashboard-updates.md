# Fase 7: Dashboard Updates

Actualizar el dashboard developer (`dev.accesly.xyz`) para exponer la selección de network al crear app, mostrar KYC status por usuario, y agregar sección Fiat provider con Dynerox status.

Duración estimada: 3 a 4 días.

## Prerequisitos

- Fase 5 completada: backend soporta Dynerox y expone `dyneroxKycStatus` en `user_fragments`.
- Fase 6 completada: SDK 2.6.0 disponible (el dashboard consume las APIs, no el SDK directo, pero los tipos son útiles).
- Repo `DashboardAcceslyDev` local.

## Paso 1: App creation con network selector

Editar `src/app/(dashboard)/apps/new/page.tsx`:

- Líneas 126-137 ya muestran toggles testnet/mainnet. Cambiar a **radio buttons exclusivos** (no ambos al mismo tiempo).
- Agregar warning modal antes de submit cuando `mainnet` está seleccionado:

```tsx
{selectedNetwork === 'mainnet' && (
  <div className="warning-box">
    <strong>Vas a crear un app MAINNET.</strong>
    <ul>
      <li>Los usuarios operarán con fondos reales.</li>
      <li>Onramp requiere KYC verificado.</li>
      <li>Este parámetro NO se puede cambiar después.</li>
    </ul>
    <label>
      <input type="checkbox" checked={confirmed} onChange={setConfirmed} />
      Entiendo las consecuencias
    </label>
  </div>
)}
```

- Disable el submit button si mainnet + !confirmed.

## Paso 2: Settings con network inmutable

Editar `src/app/(dashboard)/apps/[appId]/settings/page.tsx` líneas 578-579 y 648-662:

- Agregar prop `hasWallets: boolean` que se calcula al mount (fetch `GET /apps/{id}/users?limit=1`).
- Si `hasWallets === true`, deshabilitar el toggle de network con tooltip "No editable: ya existen wallets".
- Si `hasWallets === false`, permitir edición con la misma warning modal que en creation.

Backend enforcement (Fase 4 Paso 7) ya rechaza, pero UX aquí evita que el user intente en vano.

## Paso 3: AppSwitcher con NetworkBadge

Editar `src/components/AppSwitcher.tsx` líneas 96-107:

Actualmente muestra `<EnvBadge env={activeApp.ownership?.environment ?? 'dev'} />`. Agregar network:

```tsx
<div className="app-switcher-item">
  <Avatar app={activeApp} />
  <div>
    <div className="app-name">{activeApp.appName}</div>
    <div className="app-badges">
      <EnvBadge env={activeApp.ownership?.environment ?? 'dev'} />
      <NetworkBadge network={activeApp.networks?.mainnet ? 'mainnet' : 'testnet'} />
    </div>
  </div>
</div>
```

Crear `src/components/NetworkBadge.tsx` con el mismo diseño que el del SDK kit (lavender para mainnet, gris para testnet).

## Paso 4: Users page con KYC column

Editar `src/app/(dashboard)/apps/[appId]/users/page.tsx` líneas 196-227:

- Agregar columna "KYC" en la tabla:

```tsx
<th>KYC</th>
// ...
<td>
  <KycChip status={user.dyneroxKycStatus ?? 'not-started'} />
</td>
```

Crear componente `KycChip`:

- `active`: verde
- `pending_identity`, `pending_authorization`: amarillo
- `not-started`: gris
- `inactive`: rojo

Filtro adicional en el search bar: dropdown "KYC status" con opciones para filtrar.

Actualizar `src/lib/apps.ts` en el type `AppUserRow` para incluir `dyneroxKycStatus?: string`.

## Paso 5: Sidebar con nueva sección Fiat

Editar `src/components/Sidebar.tsx` líneas 29-42:

Agregar entrada nueva en la sección APLICACIÓN:

```tsx
{
  href: `/apps/${appId}/fiat`,
  label: 'Fiat provider',
  icon: <IcoWallet />,
},
```

Crear la página `src/app/(dashboard)/apps/[appId]/fiat/page.tsx`:

- Muestra qué provider está habilitado (Dynerox en producción o sandbox según el network del app)
- Cuenta de usuarios por KYC status (query al backend `GET /apps/{id}/kyc-stats`)
- Link a la documentación técnica del flow en `accesly.xyz/docs/kyc-fiat`
- Setting toggle "Habilitar on ramp para users" (default off al crear app, on cuando el integrador acepta terms)

## Paso 6: Dev tools tab actualizado

Editar `src/app/(dashboard)/apps/[appId]/dev-tools/page.tsx` líneas 129-143 y 230, 387, 524.

Los snippets deben reflejar el nuevo API:

- Env var `PUBLIC_ACCESLY_APP_ID` (o VITE_ o NEXT_PUBLIC_ según framework)
- Provider con `env="dev"` + `authCallbackPath` si aplica
- Ejemplo de `<AddFundsFlow />` con KYC preflight
- Ejemplo de custom UI con `useKyc()` + `useNetwork()`

Actualizar ConfigSummary para mostrar el network activo del app.

## Paso 7: Admin flags page (previo a Fase 8)

Preparar la ruta `src/app/(dashboard)/admin/flags/page.tsx` como placeholder. La lógica completa se agrega en Fase 8. Por ahora dejar UI vacía con "Coming soon" para el layout.

Restringir acceso: solo Accesly Core developers pueden verla. Chequear via un custom attribute Cognito o hardcoded email allowlist temporal.

## Paso 8: Overview KPIs con network dimension

Editar `src/app/(dashboard)/apps/[appId]/overview/page.tsx`:

Como cada app es 1 network, la overview del app no requiere dimension network en los charts. Pero el sidebar del developer (nivel superior) sí podría mostrar el split "5 apps testnet, 2 apps mainnet".

Agregar en el sidebar hover un pequeño counter "TN 5 / MN 2" si el developer tiene apps en ambas networks.

## Paso 9: Test manual

Con el dashboard corriendo local (localhost:3000):

1. Login como developer
2. Crear app testnet, verificar toggle correcto
3. Crear otro app mainnet, verificar warning + confirmación
4. Cambiar entre apps con AppSwitcher, verificar NetworkBadge
5. Settings del app: intentar cambiar network → bloqueado si tiene wallets
6. Users page: crear un user vía SDK, verificar que aparece con KycChip "not-started"
7. Fiat page: verificar que muestra Dynerox provider info correctamente

## Paso 10: Deploy a Vercel

```bash
git push origin main
```

Vercel auto deploya del branch main del repo `DashboardAccesly`.

Verificar que `dashboard-accesly.vercel.app` (o `dev.accesly.xyz` si el DNS ya funciona) refleja los cambios.

## Criterio de done

- Crear app mainnet requiere confirmación explícita
- App con wallets no permite cambiar network (bloqueado en UI + backend)
- AppSwitcher muestra NetworkBadge visible
- Users page muestra KYC status por user
- Sidebar tiene nueva sección Fiat provider funcional
- Dev tools snippets actualizados con Dynerox + multi network
- Test manual pasa sin regresiones

## Riesgos

- **UX confuso "environment vs network"**: env (dev/staging/prod) es sobre qué backend AWS usa. Network (testnet/mainnet) es sobre qué chain Stellar. Los users van a confundir. Agregar tooltips explicativos.
- **Dashboard obsoleto en producción**: si el deploy Vercel falla, hay disconnect entre backend y frontend. Rollback strategy: revert a commit previo, redeploy.

## Notas

Ninguna todavía.
