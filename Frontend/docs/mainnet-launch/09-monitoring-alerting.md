# Fase 9: Monitoring y Alerting

Observabilidad diferenciada por network. CloudWatch alarms, PagerDuty setup, runbooks para incidents.

Duración estimada: 2 días.

## Prerequisitos

- Fase 4: Lambdas emitiendo `network` en logs y metrics.
- Fase 8: kill switch operativo para responder rápido a alarms.

## Paso 1: CloudWatch alarms per network

Editar `CloudServices-accesly/infra/lib/observability-stack.ts`.

Agregar alarms específicas mainnet con thresholds más estrictos que testnet:

```typescript
// Mainnet Lambda error rate > 0.5%
new cloudwatch.Alarm(this, 'MainnetLambdaErrorRateHigh', {
  metric: new cloudwatch.MathExpression({
    expression: 'errors / invocations * 100',
    usingMetrics: {
      errors: mainnetErrorsMetric,
      invocations: mainnetInvocationsMetric,
    },
  }),
  threshold: 0.5,
  evaluationPeriods: 2,
  datapointsToAlarm: 2,
  alarmDescription: 'Mainnet Lambdas error rate above 0.5% for 10 min',
  alarmActions: [pagerDutyTopic],
});

// KMS errors (mainnet key operations failing)
// DDB throttling
// Relayer XLM balance < 30 XLM
// Channels XLM balance < 20 XLM
// Dynerox webhook signature failures > 5%
```

Cada alarm tiene:

- Threshold específico
- Evaluation periods para reducir false positives
- Description descriptiva
- SNS action a PagerDuty topic

## Paso 2: Metrics con dimension `network`

Cada Lambda que emite CloudWatch metrics debe incluir dimension:

```typescript
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cw = new CloudWatchClient({});

await cw.send(new PutMetricDataCommand({
  Namespace: 'Accesly/Wallet',
  MetricData: [{
    MetricName: 'WalletCreated',
    Value: 1,
    Unit: 'Count',
    Dimensions: [
      { Name: 'AppId', Value: appId },
      { Name: 'Network', Value: network }, // NUEVO
    ],
  }],
}));
```

Aplicar en Lambdas:

- [ ] `create-wallet`: emit `WalletCreated`
- [ ] `swap`: emit `SwapCompleted` con dimensiones `Network`, `FromAsset`, `ToAsset`
- [ ] `submit-tx`: emit `TxSubmitted` con `Network`
- [ ] `recovery-otp`: emit `RecoveryCompleted` con `Network`

## Paso 3: CloudWatch Dashboard mainnet

Crear dashboard nuevo en CloudWatch Console (o via CDK):

```typescript
const mainnetDashboard = new cloudwatch.Dashboard(this, 'MainnetDashboard', {
  dashboardName: `accesly-${stage}-mainnet-ops`,
});

mainnetDashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Mainnet TPS by Operation',
    left: [
      metricWithDimension('WalletCreated', { Network: 'mainnet' }),
      metricWithDimension('SwapCompleted', { Network: 'mainnet' }),
      metricWithDimension('TxSubmitted', { Network: 'mainnet' }),
    ],
    period: cdk.Duration.minutes(1),
    statistic: 'Sum',
  }),
  new cloudwatch.GraphWidget({
    title: 'Mainnet Lambda Errors',
    left: [/* error metrics per Lambda con Network=mainnet */],
  }),
  new cloudwatch.SingleValueWidget({
    title: 'Relayer XLM Balance',
    metrics: [relayerBalanceMetric],
  }),
);
```

Panels a incluir:

- TPS por operation (line chart)
- Latencia p50 y p99
- Error rate por endpoint
- Fondos de relayer + channels
- Wallets creadas hoy / semana
- Volumen USDC transactado
- KYC status distribution (bar chart)

## Paso 4: PagerDuty free tier setup

Free tier de PagerDuty soporta 5 users y 5 servicios. Suficiente para MVP.

1. Registrar cuenta en pagerduty.com
2. Crear service "Accesly Mainnet"
3. Configurar escalation policy: vos como primer on-call, ninguno como fallback (o un segundo dev)
4. Copiar integration key
5. En AWS SNS, agregar subscription tipo HTTPS al endpoint webhook de PagerDuty
6. Test: trigger alarm manual → verificar que llega notificación al celular

## Paso 5: Sentry para SDK errors

Los errores del cliente end user quedan invisible sin instrumentation. Agregar Sentry al SDK.

En `SDKAccesly/packages/react/src/hooks/useAccesly.ts`, exponer prop `onError` en el provider que captura errors globales:

```typescript
<AcceslyProvider
  telemetry={(event) => {
    if (event.type === 'error') {
      Sentry.captureException(event.error, { extra: event.context });
    }
  }}
>
```

Documentar en `accesly.xyz/docs/sdk-reference` cómo enganchar Sentry.

## Paso 6: Runbook `mainnet-incidents.md`

Crear `CloudServices-accesly/docs/runbooks/mainnet-incidents.md`:

Contenido mínimo:

```markdown
# Mainnet Incident Response Runbook

## Cuando entra un alarm PagerDuty

1. Ack en PagerDuty en <5 min. Si no ack, escala.
2. Abrir CloudWatch mainnet dashboard.
3. Identificar la Lambda o dependencia afectada.
4. Decidir: pausar mainnet o mitigar sin pausa.

## Cómo pausar mainnet en <30 segundos

1. Ir a dashboard-accesly.vercel.app/admin/flags
2. Toggle `mainnet_enabled_global` a OFF
3. Verify: hacer request a `/wallets` con app mainnet debe devolver 503

## Cuando reactivar

- Bug identificado y fix deployado
- Verificación en testnet primero
- Toggle back to ON, monitorear 30 min con full attention

## Comunicación externa

Template tweet:
"Estamos experimentando problemas técnicos en mainnet. Testnet no afectado. Update en X min."

Update status page (si existe):
- Nombre incidente
- Servicios afectados
- Estado current
- Próxima update en X min

## Post mortem

Template en `docs/postmortems/YYYY-MM-DD-<incident>.md`:

- Timeline
- Root cause
- Impacto (users afectados, monto involved)
- Fix aplicado
- Prevención (qué hacemos para que no vuelva)
```

## Paso 7: Business metrics dashboard

Además de operacional, crear vista de negocio:

- Wallets totales por network
- USDC total custodiado (informacional, no realmente custodiado)
- Volumen swap 24h / 7d / 30d
- KYC completions por día
- Onramp volumen MXN por día

Este dashboard vive en el mismo CloudWatch pero separado en un board distinto llamado `accesly-{stage}-business-metrics`.

## Paso 8: Health check público

El endpoint `GET /status` ya existe (Lambda `status/src/handler.ts`). Verificar que reporta:

- Backend Accesly: OK / degraded
- Soroban RPC testnet: latencia + up
- Soroban RPC mainnet: latencia + up
- Dynerox API: latencia + up
- KMS: quotas restantes

Response ejemplo:

```json
{
  "status": "operational",
  "components": {
    "backend": "operational",
    "soroban_testnet": "operational",
    "soroban_mainnet": "operational",
    "dynerox": "operational"
  },
  "last_checked": "2026-07-02T14:30:00Z"
}
```

Exponer public en `api.accesly.xyz/status`. Referenciar desde `accesly.xyz/status` opcionalmente.

## Criterio de done

- Alarms mainnet en CloudWatch configuradas y visibles
- Test: trigger alarm manual → notificación llega a PagerDuty
- Dashboard mainnet ops accesible en CloudWatch
- Sentry integrado en SDK (opcional pero recomendado)
- Runbook escrito y compartido con equipo
- `/status` endpoint devuelve response coherente

## Riesgos

- **Alarm fatigue**: si los thresholds son muy sensibles, PagerDuty despierta de noche por false positives. Tune iterativamente: primeros 7 días con thresholds relajados, ajustar según datos reales.
- **PagerDuty free tier limits**: 5 users, 5 services. Suficiente para MVP. Si crecemos, pagar tier básico ($20/mes).

## Notas

Ninguna todavía.
