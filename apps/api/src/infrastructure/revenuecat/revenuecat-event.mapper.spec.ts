import {
  EstadoSuscripcion,
  TiendaSuscripcion,
} from '../../domain/value-objects/plan';
import { interpretarEventoRevenueCat } from './revenuecat-event.mapper';

const FUNDADOR = 'plus_fundador';
const T0 = Date.UTC(2026, 11, 10, 12);
const VENCE = Date.UTC(2027, 0, 10, 12);
const GRACIA = Date.UTC(2027, 0, 26, 12);

function evento(cambios: Record<string, unknown> = {}) {
  return {
    api_version: '1.0',
    event: {
      id: 'evt-1',
      type: 'INITIAL_PURCHASE',
      event_timestamp_ms: T0,
      app_user_id: 'user-1',
      original_app_user_id: 'user-1',
      aliases: ['user-1'],
      product_id: 'plus_mensual',
      period_type: 'NORMAL',
      purchased_at_ms: T0,
      expiration_at_ms: VENCE,
      store: 'APP_STORE',
      environment: 'PRODUCTION',
      entitlement_ids: ['plus'],
      ...cambios,
    },
  };
}

const interpretar = (cambios?: Record<string, unknown>) =>
  interpretarEventoRevenueCat(evento(cambios), {
    productoFundador: FUNDADOR,
  }).getValue();

describe('interpretarEventoRevenueCat', () => {
  describe('envelope', () => {
    it.each([
      ['no es un objeto', 'texto'],
      ['no trae event', { api_version: '1.0' }],
      ['el id no es texto', evento({ id: 7 })],
      ['el id está vacío', evento({ id: '' })],
      ['no trae type', evento({ type: undefined })],
      [
        'la fecha del evento no es un entero',
        evento({ event_timestamp_ms: 'hoy' }),
      ],
    ])('rechaza un cuerpo que %s', (_caso, cuerpo) => {
      const resultado = interpretarEventoRevenueCat(cuerpo, {
        productoFundador: FUNDADOR,
      });

      expect(resultado.isFail()).toBe(true);
    });

    it('devuelve el id y el tipo del evento junto al cambio', () => {
      expect(interpretar()).toMatchObject({
        id: 'evt-1',
        tipo: 'INITIAL_PURCHASE',
      });
    });
  });

  describe('suscripción', () => {
    it.each([
      'INITIAL_PURCHASE',
      'RENEWAL',
      'UNCANCELLATION',
      'SUBSCRIPTION_EXTENDED',
    ])('%s deja la suscripción activa hasta su vencimiento', (type) => {
      expect(interpretar({ type }).cambio).toEqual({
        tipo: 'suscripcion',
        usuarios: ['user-1'],
        suscripcion: {
          estado: EstadoSuscripcion.Activa,
          producto: 'plus_mensual',
          tienda: TiendaSuscripcion.AppStore,
          venceEn: new Date(VENCE),
        },
        ocurridoEn: new Date(T0),
      });
    });

    it('PLAY_STORE es la tienda de Google', () => {
      const { cambio } = interpretar({ store: 'PLAY_STORE' });

      expect(cambio).toMatchObject({
        suscripcion: { tienda: TiendaSuscripcion.PlayStore },
      });
    });

    it('CANCELLATION deja la suscripción cancelada, vigente hasta su vencimiento', () => {
      const { cambio } = interpretar({
        type: 'CANCELLATION',
        cancel_reason: 'UNSUBSCRIBE',
      });

      expect(cambio).toMatchObject({
        tipo: 'suscripcion',
        suscripcion: {
          estado: EstadoSuscripcion.Cancelada,
          venceEn: new Date(VENCE),
        },
      });
    });

    it('CANCELLATION por reembolso la deja vencida en el momento del evento', () => {
      const { cambio } = interpretar({
        type: 'CANCELLATION',
        cancel_reason: 'CUSTOMER_SUPPORT',
      });

      expect(cambio).toMatchObject({
        tipo: 'suscripcion',
        suscripcion: {
          estado: EstadoSuscripcion.Vencida,
          venceEn: new Date(T0),
        },
      });
    });

    it('BILLING_ISSUE la deja en gracia hasta el fin del período de gracia', () => {
      const { cambio } = interpretar({
        type: 'BILLING_ISSUE',
        grace_period_expiration_at_ms: GRACIA,
      });

      expect(cambio).toMatchObject({
        suscripcion: {
          estado: EstadoSuscripcion.EnGracia,
          venceEn: new Date(GRACIA),
        },
      });
    });

    it('BILLING_ISSUE sin período de gracia usa el vencimiento', () => {
      const { cambio } = interpretar({
        type: 'BILLING_ISSUE',
        grace_period_expiration_at_ms: null,
      });

      expect(cambio).toMatchObject({
        suscripcion: {
          estado: EstadoSuscripcion.EnGracia,
          venceEn: new Date(VENCE),
        },
      });
    });

    it('EXPIRATION la deja vencida', () => {
      const { cambio } = interpretar({ type: 'EXPIRATION' });

      expect(cambio).toMatchObject({
        suscripcion: {
          estado: EstadoSuscripcion.Vencida,
          venceEn: new Date(VENCE),
        },
      });
    });

    it('REFUND_REVERSED la deja activa otra vez', () => {
      const { cambio } = interpretar({ type: 'REFUND_REVERSED' });

      expect(cambio).toMatchObject({
        suscripcion: { estado: EstadoSuscripcion.Activa },
      });
    });

    it('ignora un evento de suscripción sin vencimiento', () => {
      expect(interpretar({ expiration_at_ms: null }).cambio.tipo).toBe(
        'ignorado',
      );
    });

    it('ignora un evento sin producto', () => {
      expect(interpretar({ product_id: undefined }).cambio.tipo).toBe(
        'ignorado',
      );
    });
  });

  describe('usuarios', () => {
    it('ordena app_user_id, original_app_user_id y aliases, sin repetir', () => {
      const { cambio } = interpretar({
        app_user_id: 'user-nuevo',
        original_app_user_id: 'user-viejo',
        aliases: ['user-viejo', 'user-otro', 'user-nuevo'],
      });

      expect(cambio).toMatchObject({
        usuarios: ['user-nuevo', 'user-viejo', 'user-otro'],
      });
    });

    it('descarta los identificadores anónimos de RevenueCat y los que no son texto', () => {
      const { cambio } = interpretar({
        app_user_id: '$RCAnonymousID:abc',
        original_app_user_id: 'user-1',
        aliases: [42, '', 'user-1'],
      });

      expect(cambio).toMatchObject({ usuarios: ['user-1'] });
    });

    it('ignora el evento cuando no queda ningún usuario', () => {
      const { cambio } = interpretar({
        app_user_id: '$RCAnonymousID:abc',
        original_app_user_id: undefined,
        aliases: undefined,
      });

      expect(cambio.tipo).toBe('ignorado');
    });
  });

  describe('plan Fundador', () => {
    it('NON_RENEWING_PURCHASE del producto Fundador otorga el permiso', () => {
      const { cambio } = interpretar({
        type: 'NON_RENEWING_PURCHASE',
        product_id: FUNDADOR,
        expiration_at_ms: null,
      });

      expect(cambio).toEqual({
        tipo: 'fundador_otorgado',
        usuarios: ['user-1'],
        ocurridoEn: new Date(T0),
      });
    });

    it('CANCELLATION del producto Fundador lo revoca, cualquiera sea el motivo', () => {
      const { cambio } = interpretar({
        type: 'CANCELLATION',
        product_id: FUNDADOR,
        cancel_reason: 'CUSTOMER_SUPPORT',
        expiration_at_ms: null,
      });

      expect(cambio).toEqual({
        tipo: 'fundador_revocado',
        usuarios: ['user-1'],
        ocurridoEn: new Date(T0),
      });
    });

    it('REFUND_REVERSED del producto Fundador lo otorga otra vez', () => {
      const { cambio } = interpretar({
        type: 'REFUND_REVERSED',
        product_id: FUNDADOR,
        expiration_at_ms: null,
      });

      expect(cambio.tipo).toBe('fundador_otorgado');
    });

    it.each(['EXPIRATION', 'RENEWAL', 'BILLING_ISSUE'])(
      '%s del producto Fundador se ignora: no es una suscripción',
      (type) => {
        expect(interpretar({ type, product_id: FUNDADOR }).cambio.tipo).toBe(
          'ignorado',
        );
      },
    );

    it('ignora una compra no renovable de otro producto', () => {
      const { cambio } = interpretar({
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'propina',
        expiration_at_ms: null,
      });

      expect(cambio.tipo).toBe('ignorado');
    });

    it('sin producto Fundador configurado, su compra se ignora', () => {
      const resultado = interpretarEventoRevenueCat(
        evento({
          type: 'NON_RENEWING_PURCHASE',
          product_id: FUNDADOR,
          expiration_at_ms: null,
        }),
        { productoFundador: undefined },
      );

      expect(resultado.getValue().cambio.tipo).toBe('ignorado');
    });
  });

  describe('transferencia', () => {
    it('TRANSFER mueve las compras entre cuentas', () => {
      const { cambio } = interpretar({
        type: 'TRANSFER',
        app_user_id: undefined,
        product_id: undefined,
        transferred_from: ['user-viejo', '$RCAnonymousID:abc'],
        transferred_to: ['user-nuevo'],
      });

      expect(cambio).toEqual({
        tipo: 'transferencia',
        desde: ['user-viejo'],
        hacia: ['user-nuevo'],
        ocurridoEn: new Date(T0),
      });
    });

    it.each([
      ['origen', { transferred_from: [], transferred_to: ['user-nuevo'] }],
      [
        'destino',
        { transferred_from: ['user-viejo'], transferred_to: undefined },
      ],
    ])('ignora un TRANSFER sin %s', (_caso, campos) => {
      expect(interpretar({ type: 'TRANSFER', ...campos }).cambio.tipo).toBe(
        'ignorado',
      );
    });
  });

  describe('eventos que no cambian derechos', () => {
    it.each([
      'TEST',
      'SUBSCRIPTION_PAUSED',
      'PRODUCT_CHANGE',
      'TEMPORARY_ENTITLEMENT_GRANT',
      'EXPERIMENT_ENROLLMENT',
      'UN_TIPO_QUE_NO_EXISTE_TODAVIA',
    ])('ignora %s', (type) => {
      expect(interpretar({ type }).cambio.tipo).toBe('ignorado');
    });

    it.each(['PROMOTIONAL', 'STRIPE', undefined])(
      'ignora una suscripción de la tienda %s',
      (store) => {
        expect(interpretar({ store }).cambio.tipo).toBe('ignorado');
      },
    );

    it('ignora un derecho promocional aunque venga de una tienda', () => {
      expect(interpretar({ period_type: 'PROMOTIONAL' }).cambio.tipo).toBe(
        'ignorado',
      );
    });
  });
});
