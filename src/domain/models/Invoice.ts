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
