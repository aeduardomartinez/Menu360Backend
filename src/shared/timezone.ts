/**
 * Zona horaria del servidor.
 *
 * Todo el cálculo de fechas del backend usa la hora LOCAL del proceso:
 * `new Date('2026-09-22T00:00:00')` sin sufijo de zona, y `setHours()` para
 * correr el arranque de la jornada. En tu máquina eso funcionaba porque el
 * computador está en hora de Colombia. En Render el servidor corre en UTC, y
 * entonces las mismas cuentas daban una ventana corrida cinco horas: al
 * filtrar el historial por la jornada en curso, un pedido hecho después de
 * las 7pm de Colombia quedaba fuera del rango y el historial se veía vacío
 * aunque el pedido estuviera guardado.
 *
 * Lo más barato y menos frágil es que el proceso entero piense en la hora del
 * negocio. Node lee process.env.TZ en cada operación con fechas, así que
 * fijarlo acá —antes de que cualquier otro módulo calcule nada— alinea de una
 * vez el historial, el cierre de caja, las ventas del día y los reportes.
 *
 * Va como valor por defecto y no como imposición: si algún día hay que
 * desplegar en otra zona, basta definir TZ en el entorno.
 *
 * NOTA para cuando la plataforma salga de Colombia: esto asume que todos los
 * restaurantes están en la misma zona horaria. El día que entre uno de otro
 * país, la zona tiene que pasar a ser un dato del restaurante —igual que
 * businessDayStartHour— y las consultas calcular la ventana con la zona de
 * cada uno, no con la del servidor.
 */
process.env.TZ = process.env.TZ || 'America/Bogota';

/** Zona horaria efectiva del proceso. Se exporta solo para poder registrarla. */
export const TIMEZONE = process.env.TZ;
