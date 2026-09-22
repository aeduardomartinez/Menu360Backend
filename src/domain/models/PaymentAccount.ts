/// Cuenta bancaria o billetera digital que el restaurante expone al cliente
/// cuando el pedido se paga por "Transferencia", para que sepa exactamente a
/// qué cuenta consignar antes de confirmar el pedido (en vez de tener que
/// preguntarlo por WhatsApp).
export interface PaymentAccount {
  id: string;
  /// Nombre del banco o billetera. Ej: "Bancolombia", "Nequi", "Daviplata".
  bankName: string;
  /// Tipo de cuenta. Para cuentas bancarias tradicionales: 'Ahorros' | 'Corriente'.
  /// Para billeteras (Nequi, Daviplata, etc.) se usa el mismo nombre como tipo.
  accountType: string;
  /// Número de cuenta o número de celular (billeteras).
  accountNumber: string;
  /// Nombre del titular de la cuenta, para que el cliente pueda verificar que
  /// no está transfiriendo a una cuenta equivocada.
  accountHolder: string;
  /// Permite desactivar una cuenta temporalmente sin borrarla (y perder el
  /// historial de qué cuentas se han usado).
  isActive: boolean;
  /// URL del logo en Firebase Storage. Solo se acepta un enlace al bucket del
  /// proyecto (ver esUrlDeStorage en RestaurantService): este valor acaba en
  /// un atributo src de la pantalla de pago del cliente, y una URL arbitraria
  /// convertiría el panel en una forma de hacer que el navegador del cliente
  /// pida recursos a un tercero. Si no se sube ninguno, el frontend muestra
  /// una insignia de color por marca en su lugar (no reproducimos logos
  /// oficiales de bancos/billeteras sin licencia clara para ello).
  logoUrl?: string;
}
