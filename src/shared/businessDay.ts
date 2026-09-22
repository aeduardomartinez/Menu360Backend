/**
 * Día contable (jornada) del restaurante.
 *
 * Un restaurante que atiende de 4pm a 2am trabaja UNA sola jornada, pero el
 * calendario la parte en dos a la medianoche. Con el día calendario pasaban
 * cosas como estas apenas daban las 12:00am, en plena operación:
 *   - la caja abierta a las 4pm dejaba de ser "de hoy", el cajero no podía
 *     facturar y le aparecía la advertencia de sesión sin cerrar;
 *   - el backend rechazaba facturar un pedido tomado 10 minutos antes
 *     ("es de un día anterior");
 *   - el barrido automático de pedidos viejos (que corre cada hora) daba por
 *     abandonados los pedidos del turno: cancelaba los domicilios con
 *     domiciliario asignado y cerraba el resto.
 *
 * Por eso la jornada no arranca a medianoche sino a BUSINESS_DAY_START_HOUR:
 * todo lo que pasa entre las 4:00am del 18 y las 3:59am del 19 pertenece al
 * día 18.
 *
 * Es un único valor para todo el sistema (ajustable con la variable de
 * entorno BUSINESS_DAY_START_HOUR). Si algún día un restaurante necesita otra
 * hora de corte, esto pasa a ser una columna suya y estas funciones reciben
 * el valor por parámetro — la firma ya está preparada para eso.
 */

const DEFAULT_BUSINESS_DAY_START_HOUR = 4;

const parsedHour = Number(process.env.BUSINESS_DAY_START_HOUR);

export const BUSINESS_DAY_START_HOUR =
  Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23
    ? parsedHour
    : DEFAULT_BUSINESS_DAY_START_HOUR;

/**
 * Momento en que arrancó la jornada a la que pertenece `date`.
 * Con corte a las 4am: el 18 a las 11pm y el 19 a la 1am devuelven los dos el
 * 18 a las 4:00am.
 */
export function startOfBusinessDay(date: Date, startHour: number = BUSINESS_DAY_START_HOUR): Date {
  const result = new Date(date);
  if (result.getHours() < startHour) {
    // Antes de la hora de corte todavía estamos en la jornada del día anterior.
    result.setDate(result.getDate() - 1);
  }
  result.setHours(startHour, 0, 0, 0);
  return result;
}

/** Momento en que arrancó la jornada en curso. */
export function startOfCurrentBusinessDay(startHour: number = BUSINESS_DAY_START_HOUR): Date {
  return startOfBusinessDay(new Date(), startHour);
}

/** ¿Las dos fechas caen en la misma jornada? */
export function isSameBusinessDay(a: Date, b: Date, startHour: number = BUSINESS_DAY_START_HOUR): boolean {
  return startOfBusinessDay(a, startHour).getTime() === startOfBusinessDay(b, startHour).getTime();
}
