import { ClientDIAN } from './Client';
import { Order } from './Order';

export interface InvoiceTax {
  taxType: 'IVA' | 'IMPOCONSUMO';
  taxPercentage: number;
  taxAmount: number;
  taxableAmount: number;
}

export interface InvoiceDIAN {
  id: string; // Internal Invoice ID
  invoiceNumber: string; // Resolucion DIAN
  // Restaurante dueño de la factura. Obligatorio a propósito: es lo que evita
  // que una factura termine guardada a nombre de otra tienda (ver create en
  // PrismaInvoiceRepository), y al ser requerido el compilador obliga a
  // pasarlo en cualquier sitio nuevo que genere facturas.
  restaurantId: string;
  // Datos que devuelve el proveedor de facturación electrónica: el CUFE es el
  // código con el que la DIAN valida la factura (el que alimenta el QR del
  // recibo) y dianUrl es la copia pública de la factura, si el proveedor la
  // expone. Quedan vacíos mientras no haya proveedor configurado.
  cufe?: string;
  dianUrl?: string;
  orderId: string;
  order?: Order;
  client: ClientDIAN;
  subtotal: number;
  totalTaxes: number;
  totalAmount: number;
  taxes: InvoiceTax[];
  issueDate: Date;
  status: 'DRAFT' | 'ISSUED' | 'REPORTED_DIAN' | 'ERROR_DIAN';
}
