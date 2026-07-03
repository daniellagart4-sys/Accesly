# Fase 13: Beta Launch

Abrir mainnet a 20 a 50 users seleccionados. Cap 100 USD por wallet, on call 24/7 primera semana, iteración basada en feedback real.

Duración estimada: 2 días para launch. Después es operación ongoing.

## Prerequisitos

- Fases 1 al 12 completadas.
- Runbook de incident response probado.
- Cap `mainnet_max_wallet_value_usd` = 100 en feature flags.
- On call rotation activa (mínimo vos + 1 backup).

## Paso 1: Definir whitelist inicial

Criterios de selección de los primeros 20 a 50 users:

- **Perfil tech**: al menos 5 developers experimentados que puedan reportar bugs con detalle técnico. Ideal si son integradores potenciales de Accesly.
- **Perfil no tech**: 10 a 15 users normales que representen el target real. Amigos, familia técnicamente literada, contacts de LinkedIn.
- **Distribución geográfica**: si podés, users de 2-3 ciudades distintas para verificar UX en diversos providers de internet.
- **Distribución de devices**: mix de iOS (mínimo iOS 17.4), Android, Mac + Windows.

Excluir:

- Users en OFAC lists (Dynerox screening automáticamente los rechaza pero pre filtrar ahorra time)
- Users sin CURP mexicano (si querés testear on ramp fiat)

## Paso 2: Whitelist enforcement

Agregar campo `mainnet_whitelist` en `user_fragments`:

```
mainnet_whitelist: boolean (default: false)
```

Backfill: setear `true` para los 20-50 users seleccionados.

En las Lambdas mainnet (create-wallet, swap, onramp), agregar check:

```typescript
if (network === 'mainnet' && !fragment.mainnet_whitelist) {
  throw new AuthError('Access to mainnet is invite only during beta');
}
```

Con esto, si alguien random encuentra un app mainnet, no puede operar hasta que lo agregues.

## Paso 3: Onboarding invitations

Preparar template de email de invitación:

```
Subject: Sos parte del beta cerrado de Accesly (Stellar Mainnet)

Hola {name},

Te invito a probar Accesly en Stellar mainnet.

Es un wallet no custodial: la llave privada nunca sale de tu device.
Firmás con Face ID o Touch ID. No hay seed phrase.

Cap del beta: 100 USD por wallet. No pierdas plata en esto todavía.

Instrucciones:
1. Ir a https://app.accesly.xyz/demo
2. Signup con este email (already whitelisted)
3. Crear wallet. Vas a elegir una passphrase de recovery. ANOTALA en un lugar seguro. Si la perdés, los fondos son irrecuperables.
4. Fondear con 20 USD equivalente en XLM o USDC (yo te mando desde mi wallet si me pasás tu address)
5. Probar send, swap, receive.

Reportá cualquier bug o rareza a bugs@accesly.xyz o al Telegram [link].

Gracias por ser parte del beta.

Daniel
```

Mandar en batches de 5 users al principio (no los 50 de golpe). Primera cohort de 5, esperar 3 días, segunda cohort de 15, esperar 3 días, tercera cohort de 30.

## Paso 4: On call rotation

Primera semana del launch: vos + 1 backup.

Turnos:

- 8am a 8pm: vos primary
- 8pm a 8am: vos con backup en caso de wake up

PagerDuty escalation:

- Nivel 1: vos (5 min)
- Nivel 2: backup (10 min)
- Nivel 3: escalation to Slack channel (15 min)

Tener el teléfono al lado con notificaciones on. Probar el escalation manualmente antes del launch.

## Paso 5: Daily standup solo

Primera semana, cada día a las 9am revisar:

- CloudWatch Mainnet Ops dashboard
- Nuevos users en Users tab del dashboard
- Volumen total on chain (via GET /apps/{id}/metrics)
- Tickets abiertos en el email de soporte
- Feedback del canal Telegram/Discord
- Cualquier alarm que se hayan disparado en 24h

Escribir daily summary en 3 bullets:

- Qué pasó
- Qué se detectó
- Qué acción se toma hoy

## Paso 6: Métricas de éxito del beta

Después de 2 semanas, evaluar contra estos targets:

- **Task completion rate**: 80% de users completan signup + bootstrap wallet
- **Time to first wallet**: p50 < 60 seg desde signup
- **Recovery success rate**: > 50% de users que hacen recovery llegan al wallet (los que fallan típicamente por passphrase olvidada)
- **Error rate**: < 1% de las operaciones críticas fallan
- **Bug reports**: < 3 críticos, < 10 major
- **Retention day 7**: > 60% de users que crearon wallet en week 1 vuelven en week 2
- **Balance promedio por wallet**: ideal entre 20 y 80 USD (usando el cap)

Si algún metric queda muy por debajo, decidir: iterar (fix + relanzar) vs abrir de todos modos con caveats explícitos.

## Paso 7: Cohort de scaling

Si los primeros 20-50 users pasan bien:

- **Semana 3-4**: abrir a 200-500 users. Sigue whitelist enforced pero más generoso.
- **Semana 5-8**: subir cap a 500 USD por wallet si zero incidents.
- **Semana 9-12**: audit externo formal (OtterSec, Runtime Verification) si no lo iniciaste antes.
- **Post audit**: quitar cap, remove whitelist, public launch.

## Paso 8: Comunicación pública

Cuando estés listo para el public announcement (post beta cerrada):

- **Twitter thread**: cómo funciona, features, screenshots
- **Blog post en accesly.xyz/blog**: detalle técnico
- **Cross post**: Stellar Discord, Reddit r/Stellar, LinkedIn del equipo
- **Coordinación con Stellar Development Foundation**: probablemente les gusta que anuncies infra nueva en su ecosystem, considerá pedir un boost

Preparar todo con anticipación pero NO publicar hasta que el beta cerrado se haya cerrado con datos positivos.

## Paso 9: Ongoing maintenance

Post beta:

- Weekly: revisar métricas de business, latencias, error rates
- Weekly: releasear parches SDK con fixes
- Monthly: performance review + capacity planning
- Quarterly: retrospective con equipo + próximo trimestre roadmap
- Ongoing: responder tickets en < 24h

## Criterio de done

- Whitelist activa con 20-50 users
- On call rotation setup
- Runbook probado con alarm de prueba
- Daily standup schedule reservado en calendar
- Primera cohort de 5 users invitados y operando
- Métricas colectándose en dashboard

## Riesgos

- **Un user pierde fondos por bug**: aunque cap es 100 USD, es reputacional. Preparar fondo de compensación discretional (200-500 USD reservados) para hacer whole a users afectados si algo pasa. NO comunicarlo público, solo caso por caso.
- **Volumen explota inesperadamente**: si alguien tweetea Accesly viral, podrías tener 5000 signup requests en un día. Cap de whitelist mitiga. Además, `mainnet_new_wallets_enabled = false` cierra el flow si necesitás breathing room.
- **Audit externo confirma vulnerability**: probable en algún punto. Preparar plan de disclosure + patch fast.

## Notas

Ninguna todavía.
