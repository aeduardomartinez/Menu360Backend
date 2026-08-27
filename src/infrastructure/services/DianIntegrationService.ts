import { Order } from '../../domain/models/Order';
import { ClientDIAN } from '../../domain/models/Client';

export class DianIntegrationService {
  private readonly endpoint: string;

  constructor() {
    // Default endpoint que luego se puede configurar por variables de entorno
    this.endpoint = process.env.DIAN_API_URL || 'https://api.tuproveedor.com/v1/invoice';
  }

  async sendInvoice(order: Order, client: ClientDIAN): Promise<any> {
    try {
      // 1. Formatear los ítems (productos) de la orden según el JSON esperado por el proveedor de la DIAN.
      const listPedidos = order.items.map((item: any, index: number) => {
        // Obtenemos el precio unitario del item. unitPrice o price.
        const unitSalePrice = (item.unitPrice || item.price || 0).toFixed(2);
        
        // El impuesto es opcional
        const tax = item.taxPercentage ? item.taxPercentage.toFixed(2) : null;
        const product = item.product || {};
        
        return {
          category: product.category || "SIN_CATEGORIA",
          productName: product.name || item.name || "Producto sin nombre",
          barCode: product.barCode || `CODE-${product.id || index}`,
          internalCode: product.id ? `INT-${product.id.substring(0,8)}` : `INT-${index}`,
          available: product.currentStock || 100, // Dummy stock if not tracking
          unitSalePrice: unitSalePrice,
          discount: null, // Asumimos nulo a menos que lo extraigamos del producto
          tax: tax,
          detailProductId: product.id || `prod-detail-${index}`,
          idCategory: product.categoryId || `cat-${index}`,
          idProduct: product.id || `prod-${index}`,
          id: Date.now() + index, // Un id numérico como el de ejemplo
          quantity: item.quantity || 1
        };
      });

      // 2. Extraer y formatear los datos del cliente (Receptor de la Factura).
      // Si el cliente no quiso dar su cédula, se usa "222222222222" (Consumidor Final) estipulado por la norma.
      const document = client.identificacion || "222222222222";
      const documentType = document === "222222222222" ? "CF" : (client.tipoId || "CC"); 
      
      // 3. Armar el payload final (Cuerpo de la petición) con la estructura estricta del proveedor.
        const personType = client.tipoPersona || "natural";
        const emailFallback = client.emailContacto || "consumidorfinal@example.com"; // DIAN often requires email for electronic invoice
        const phoneFallback = client.telefonoContacto || "0000000000";
        
        // Basic extraction of city/dept from address if available (e.g. "Cartagena, Bolivar, Colombia")
        let cityFallback = client.municipio;
        let deptFallback = client.departamento;
        if (!cityFallback && client.direccion) {
          const parts = client.direccion.split(',');
          if (parts.length >= 2) {
            cityFallback = parts[0].trim();
            deptFallback = parts[1].trim();
          } else {
            cityFallback = "BOGOTA"; // Generic fallback
            deptFallback = "BOGOTA";
          }
        }
        if (!cityFallback) cityFallback = "BOGOTA";
        if (!deptFallback) deptFallback = "BOGOTA";

        const payload = {
        personType: personType, 
        documentType: documentType,
        document: document,
        paymentMethod: this.mapPaymentMethod(order.paymentMethod),
        received: order.totalAmount, 
        change: 0,
        listPedidos: listPedidos,
        electronicInvoice: true,
        receptor: {
          razonSocial: client.razonSocial || "Consumidor Final",
          tipoIdentificacion: documentType,
          identificacion: document,
          dv: client.dv || "0",
          regimen: client.regimenFiscal || "49", 
          codigoPais: "CO",
          idDepartamento: deptFallback ? "76" : "", // Dummy mapping for now
          departamento: deptFallback,
          idMunicipio: cityFallback ? "76001" : "", // Dummy mapping for now
          municipio: cityFallback,
          ciudad: cityFallback,
          direccion: client.direccion || "NO REGISTRA",
          email: emailFallback,
          telefono: phoneFallback,
          oyR: client.responsabilidades ? [
            {
              codigo: client.responsabilidades,
              nombre: "Responsabilidad"
            }
          ] : [],
          tipoOrganizacion: personType === 'juridica' ? "xxxxx-1" : "xxxxx-4"
        }
      };

      console.log('--- ENVIANDO FACTURA A DIAN ---');
      console.log('Endpoint:', this.endpoint);
      console.log('Payload JSON:\n', JSON.stringify(payload, null, 2));

      // Aquí se realizará la petición HTTP real cuando el proveedor esté definido
      // const response = await fetch(this.endpoint, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     // 'Authorization': `Bearer ${token}` si se requiere en el futuro
      //   },
      //   body: JSON.stringify(payload)
      // });
      
      // if (!response.ok) {
      //   throw new Error(`Error en API DIAN: ${response.statusText}`);
      // }
      // const result = await response.json();
      
      // Simular éxito por ahora
      return { success: true, message: 'Factura enviada exitosamente al proveedor DIAN' };

    } catch (error) {
      console.error('Error in DianIntegrationService:', error);
      throw error;
    }
  }

  private mapPaymentMethod(method: string): string {
    const methodLower = method?.toLowerCase() || '';
    if (methodLower.includes('cash') || methodLower.includes('efectivo')) return 'cash';
    if (methodLower.includes('transfer') || methodLower.includes('nequi') || methodLower.includes('bancolombia')) return 'transfer';
    if (methodLower.includes('card') || methodLower.includes('tarjeta')) return 'credit_card';
    return 'transfer'; // Default fallback
  }
}
